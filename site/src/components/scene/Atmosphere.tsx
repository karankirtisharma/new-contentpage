'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { scroll } from '@/lib/store';
import { STATIONS } from '@/lib/world';
import { heightAt } from '@/lib/terrain';
import { FOG_PARS, fogUniforms } from '@/lib/fog';
import type { TierConfig } from '@/lib/tier';

/**
 * Suspended particulate — master doc 3I.
 *
 * Two things live here and nothing else. The fake volumetric cones and the far orbital
 * rings that used to share this file are gone: the cones were a stand-in for atmosphere
 * the fog system now does properly, and the rings were set dressing from a void the world
 * no longer is.
 *
 *   DUST     · three depth layers, tiled around the camera so a 240u corridor gets real
 *              parallax out of a fixed mote count.
 *   DEBRIS   · a handful of larger, slower motes hugging the ground near the machines.
 *              Regolith kicked up and never settling, because there is no air to settle
 *              through — the cheapest possible cue that this place has gravity but no sky.
 *
 * Both are deliberately dim. Motes should read only where a practical or the moon catches
 * them; a field you can see everywhere is a field that has become a filter.
 */

/**
 * Deterministic PRNG (mulberry32).
 *
 * The fields are built in useMemo; seeding them from Math.random would reshuffle every
 * mote on any re-render and make the scene impossible to diff between runs.
 */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- dust

const dustVert = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uSpeed;
  uniform vec3 uSpread;
  attribute float aScale;
  attribute float aPhase;
  varying float vAlpha;
${FOG_PARS}

  void main() {
    vec3 p = position;

    // Tile the field around the camera. Without this a fixed mote count has to be spread
    // over the whole 240u corridor to avoid running out, which makes it so sparse it
    // reads as dirt on the lens; with it, the same motes are always local AND still move
    // past at their true world speed, so the parallax is genuine rather than simulated.
    vec2 half2 = uSpread.xz * 0.5;
    p.x = mod(p.x - cameraPosition.x + half2.x, uSpread.x) - half2.x + cameraPosition.x;
    p.z = mod(p.z - cameraPosition.z + half2.y, uSpread.z) - half2.y + cameraPosition.z;

    // slow convection drift, phase-offset per mote
    p.x += sin(uTime * 0.12 + aPhase * 6.28) * 0.9;
    p.y += cos(uTime * 0.09 + aPhase * 4.4) * 0.6;
    p.z += sin(uTime * 0.07 + aPhase * 8.1) * 0.7;
    // motes streak toward the camera as the dolly accelerates — the brief's speed cue
    p.z += uSpeed * 3.5 * (0.4 + aScale);

    // Motes die into the atmosphere like everything else. A scalar transmittance is
    // plenty here: a mote is two pixels wide, so its spectrum is not up for debate.
    float amt = lunarFogAmount(p);
    float fogT = exp(-amt * dot(uFogExtinction, vec3(0.3333)));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    gl_PointSize = uSize * aScale * (26.0 / max(dist, 0.6));
    vAlpha = smoothstep(52.0, 5.0, dist) * (0.30 + 0.70 * aScale) * fogT;
    gl_Position = projectionMatrix * mv;
  }
`;

const dustFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float a = smoothstep(0.25, 0.0, d);
    gl_FragColor = vec4(uColor, a * a * vAlpha * 0.22);
  }
`;

/**
 * NOTE ON UNIFORMS
 *
 * three's ShaderMaterial deep-clones whatever is passed as `uniforms`, so the object
 * built in useMemo is NOT the object the GPU reads. Mutating it from useFrame silently
 * does nothing — the shader compiles, renders its t=0 state, and never moves again.
 * Every animated uniform here is therefore written through a material ref, into
 * `material.uniforms`, which is the live copy.
 *
 * This is also why the fog uniforms have to be re-pointed after compile (see below):
 * the clone breaks the shared-reference trick the rest of the scene relies on.
 */
function DustLayer({
  count,
  spread,
  size,
  color,
  seed,
}: {
  count: number;
  spread: [number, number, number];
  size: number;
  color: string;
  seed: number;
}) {
  const mat = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const rand = makeRng(seed);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * spread[0];
      pos[i * 3 + 1] = rand() * spread[1];
      pos[i * 3 + 2] = (rand() - 0.5) * spread[2];
      scale[i] = 0.25 + rand() * 0.9;
      phase[i] = rand();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, [count, spread, seed]);

  const uniforms = useMemo(
    () => ({
      ...fogUniforms,
      uTime: { value: 0 },
      uSize: { value: size },
      uSpeed: { value: 0 },
      uSpread: { value: new THREE.Vector3(...spread) },
      uColor: { value: new THREE.Color(color) },
    }),
    [size, color, spread],
  );

  useFrame((state) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime.value = state.clock.elapsedTime;
    u.uSpeed.value = scroll.speed;
    // Re-point the cloned fog uniforms at the live shared values (see note above).
    u.uFogSigma.value = fogUniforms.uFogSigma.value;
    u.uFogHeight.value = fogUniforms.uFogHeight.value;
    u.uFogTime.value = fogUniforms.uFogTime.value;
    u.uFogNoise.value = fogUniforms.uFogNoise.value;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={dustVert}
        fragmentShader={dustFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------- ground debris

const debrisVert = /* glsl */ `
  uniform float uTime;
  attribute float aScale;
  attribute float aPhase;
  varying float vAlpha;
${FOG_PARS}

  void main() {
    vec3 p = position;
    // Barely moving. Debris this close to the ground is meant to make the machines feel
    // like they disturbed something, not to look like snow.
    p.x += sin(uTime * 0.05 + aPhase * 6.28) * 0.22;
    p.y += cos(uTime * 0.04 + aPhase * 3.1) * 0.14;

    float fogT = exp(-lunarFogAmount(p) * dot(uFogExtinction, vec3(0.3333)));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    gl_PointSize = 3.4 * aScale * (26.0 / max(dist, 0.6));
    vAlpha = smoothstep(34.0, 3.0, dist) * fogT;
    gl_Position = projectionMatrix * mv;
  }
`;

function DebrisMotes({ count }: { count: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const rand = makeRng(0x5eeb1e);
    const g = new THREE.BufferGeometry();
    const per = Math.max(1, Math.round(count / STATIONS.length));
    const total = per * STATIONS.length;
    const pos = new Float32Array(total * 3);
    const scale = new Float32Array(total);
    const phase = new Float32Array(total);
    let n = 0;
    for (const st of STATIONS) {
      for (let i = 0; i < per; i++) {
        const ang = rand() * Math.PI * 2;
        const r = 4 + rand() * 16;
        const x = st.position[0] + Math.cos(ang) * r;
        const z = st.position[2] + Math.sin(ang) * r;
        pos[n * 3] = x;
        pos[n * 3 + 1] = heightAt(x, z) + 0.15 + rand() * 1.35;
        pos[n * 3 + 2] = z;
        scale[n] = 0.5 + rand() * 0.8;
        phase[n] = rand();
        n++;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({ ...fogUniforms, uTime: { value: 0 }, uColor: { value: new THREE.Color('#2f5b43') } }),
    [],
  );

  useFrame((state) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime.value = state.clock.elapsedTime;
    u.uFogSigma.value = fogUniforms.uFogSigma.value;
    u.uFogHeight.value = fogUniforms.uFogHeight.value;
    u.uFogTime.value = fogUniforms.uFogTime.value;
    u.uFogNoise.value = fogUniforms.uFogNoise.value;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={debrisVert}
        fragmentShader={dustFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------- composite

const NEAR_SPREAD: [number, number, number] = [34, 9, 46];
const MID_SPREAD: [number, number, number] = [58, 16, 72];
const FAR_SPREAD: [number, number, number] = [96, 26, 110];

export default function Atmosphere({ config }: { config: TierConfig }) {
  const { dust, debris } = config;
  if (dust === 0 && debris === 0) return null;

  return (
    <group>
      {dust > 0 && (
        <>
          <DustLayer seed={1337} count={Math.round(dust * 0.5)} spread={NEAR_SPREAD} size={1.5} color="#7ba98c" />
          <DustLayer seed={7331} count={Math.round(dust * 0.32)} spread={MID_SPREAD} size={2.6} color="#4d8062" />
          {/* distant motes: the far layer exists to be eaten by the atmosphere */}
          <DustLayer seed={9173} count={Math.round(dust * 0.18)} spread={FAR_SPREAD} size={4.2} color="#22402f" />
        </>
      )}
      {debris > 0 && <DebrisMotes count={debris} />}
    </group>
  );
}
