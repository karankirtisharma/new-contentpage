'use client';

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { FOG_ZONES, MOON_DIR } from '@/lib/world';
import { heightAt } from '@/lib/terrain';
import { fogUniforms } from '@/lib/fog';
import { scroll } from '@/lib/store';
import type { TierConfig } from '@/lib/tier';

/**
 * The atmosphere's two visible halves — master doc 2A / 3F.
 *
 *   FogDriver  · owns the shared uniforms in `lib/fog.ts` and writes them once per frame
 *                from the environment timeline. Every fogged material in the scene holds
 *                references to those same uniform objects, so this one write moves the
 *                terrain, the rocks, the ridges and all six machines together.
 *   FogCards   · the art layer. The analytic chunk alone gives a beautifully correct
 *                gradient and reads as a post-process, because real fog is not a gradient
 *                — it has banks with edges you travel THROUGH. These are those banks.
 *
 * Cards are `NormalBlending`, never additive: fog OCCLUDES. Additive fog reads as glow
 * and turns the corridor into neon, which is the exact failure the brief's "green comes
 * from sources" rule exists to prevent. They pick up their emerald from the same
 * moon-directional term the chunk uses, so a bank is only luminous when you are looking
 * into the moon through it.
 */

// ---------------------------------------------------------------- driver

export function FogDriver() {
  const noise = useTexture('/textures/noise_rg.png');

  useEffect(() => {
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noise.colorSpace = THREE.NoColorSpace;
    fogUniforms.uFogNoise.value = noise;
    // Deliberately no cleanup. `fogUniforms` is module-level state shared by every
    // material in the scene, and StrictMode unmounts between its two mounts — nulling
    // the sampler there leaves already-compiled materials sampling nothing, which three
    // reports as "Cannot read properties of null (reading 'image')" on the next frame.
    // There is nothing to leak either way: useTexture caches the texture globally.
  }, [noise]);

  useFrame((state) => {
    fogUniforms.uFogSigma.value = scroll.fogSigma;
    fogUniforms.uFogHeight.value = scroll.fogHeight;
    fogUniforms.uFogTime.value = state.clock.elapsedTime;
  });

  return null;
}

// ---------------------------------------------------------------- cards

const cardVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const cardFrag = /* glsl */ `
  uniform sampler2D uNoise;
  uniform vec3 uBase;
  uniform vec3 uMoon;
  uniform vec3 uMoonDir;
  uniform float uTime;
  uniform float uSeed;
  uniform float uDensity;
  uniform float uSigma;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    // Two noise fetches at different rates: the slow one shapes the bank, the fast one
    // keeps its edge alive. Both are the same 512 tile, offset by seed so no two cards
    // in a bank share a silhouette.
    vec2 a = vUv * vec2(1.7, 0.9) + vec2(uTime * 0.006 + uSeed, uTime * 0.0035);
    vec2 b = vUv * vec2(3.4, 1.8) + vec2(-uTime * 0.011 + uSeed * 1.7, uTime * 0.008);
    float n = texture2D(uNoise, a).r * 0.65 + texture2D(uNoise, b).g * 0.35;

    // Shape: dense along the bottom, gone by the top, and zero at both ends. The falloffs
    // have to reach EXACTLY zero at the border rather than merely get small near it — a
    // smoothstep that finishes at 0.85 leaves a hard vertical line down each side of the
    // quad, and a bank with a visible rectangle around it stops being a bank.
    float ground = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.7);
    float ends = pow(max(sin(vUv.x * 3.14159265), 0.0), 0.85);
    float alpha = clamp(n * 1.35 - 0.30, 0.0, 1.0) * ground * ends * uDensity;

    // Track the timeline: when the corridor's air thins, the banks thin with it.
    alpha *= clamp(uSigma / 0.03, 0.25, 1.9);

    // A bank only reaches full strength well down the corridor. The camera drives THROUGH
    // the valley cards by design, and a short fade meant the card the dolly was inside
    // covered the entire frame with its own rectangle — fog you are in should thin out,
    // not close over the lens.
    float dist = distance(vWorld, cameraPosition);
    alpha *= smoothstep(2.5, 22.0, dist);

    if (alpha < 0.004) discard;

    // Same isotropic-plus-lobe split as the analytic chunk: a bank turned away from the
    // moon is still lit, it just is not hot. Lerping between the two colours instead made
    // every card render at its base colour, which is very nearly black.
    vec3 rd = normalize(vWorld - cameraPosition);
    float md = max(dot(rd, uMoonDir), 0.0);
    vec3 col = uBase * (0.55 + 0.45 * md) + uMoon * pow(md, 3.0);

    gl_FragColor = vec4(col, alpha);
  }
`;

type Card = {
  pos: [number, number, number];
  rotY: number;
  scale: [number, number];
  seed: number;
  density: number;
  order: number;
};

/**
 * Banks are laid out at the zone boundaries in two alternating kinds, because one kind
 * alone does not read:
 *
 *   FLANKING · tall, angled inward, set out at |x| 13-27. These are the "corridor between
 *              volumes" of brief §12 — they give the valley walls and hide the seam where
 *              the terrain sheet ends.
 *   VALLEY   · wide, short, low, sitting across the corridor at ground level. Fog collects
 *              in low ground, and without these the atmosphere only ever appeared BEHIND
 *              the hills — correct for a wall of fog, wrong for a place you are standing in.
 *
 * `renderOrder` is baked here, once, from position along the corridor: far banks draw
 * first. The camera path is fixed and forward-only, so sorting at runtime would burn a
 * sort every frame to reproduce an order that was knowable at build time (2A).
 */
function buildCards(count: number): Card[] {
  // Zone boundaries FIRST, because those are the authored transitions the fog is meant to
  // dramatise, then their midpoints to fill the gaps. Placing banks only at boundaries
  // left four of the six station holds with a dead-black background: a hold sits INSIDE a
  // zone, and the nearest boundary is either behind the camera or close enough that the
  // proximity fade has already dissolved it.
  const boundaries = FOG_ZONES.slice(1).map((z) => z.zStart);
  const midpoints = FOG_ZONES.map((z) => (z.zStart + Math.max(z.zEnd, -250)) / 2);
  const slots = [...boundaries, ...midpoints];

  const out: Card[] = [];
  let i = 0;
  while (out.length < count) {
    const b = slots[i % slots.length];
    const z = b + (i >= slots.length ? 13 : 0);
    const valley = i % 2 === 1;

    if (valley) {
      const ground = heightAt(0, z);
      out.push({
        pos: [(i % 3) * 4 - 4, ground + 2.6, z],
        // Nearly square-on to the corridor: the camera drives INTO these.
        rotY: 0.12 * (i % 3 ? 1 : -1),
        scale: [74 + (i % 3) * 14, 9],
        seed: i * 3.77,
        density: 0.40 + (i % 3) * 0.08,
        order: 0,
      });
    } else {
      const side = i % 4 === 0 ? -1 : 1;
      const lateral = side * (14 + (i % 3) * 7);
      const ground = heightAt(lateral, z);
      out.push({
        pos: [lateral, ground + 6.5, z],
        // Angled inward, so a bank presents its face to a camera coming down the corridor
        // and its edge to one already past it.
        rotY: side * -0.42 + (i % 3) * 0.07,
        scale: [46 + (i % 4) * 11, 17 + (i % 3) * 4],
        seed: i * 3.77,
        density: 0.52 + (i % 3) * 0.10,
        order: 0,
      });
    }
    i++;
  }
  // Deepest into the corridor draws first.
  out.sort((a, b2) => a.pos[2] - b2.pos[2]);
  out.forEach((c, n) => {
    c.order = -60 + n;
  });
  return out;
}

export function FogCards({ config }: { config: TierConfig }) {
  const noise = useTexture('/textures/noise_rg.png');
  const cards = useMemo(() => buildCards(config.fogCards), [config.fogCards]);

  const shared = useMemo(
    () => ({
      uNoise: { value: noise },
      // Not PALETTE.fogBase: that is the colour of AIR, which is almost black, and a card
      // painted with it does not merely vanish — it renders DARKER than the regolith
      // behind it and reads as a hole cut in the world. A bank is a lit object, and must
      // never be dimmer than the unlit ground it hangs over.
      uBase: { value: new THREE.Color('#16321f') },
      uMoon: { value: new THREE.Color('#4fb27e') },
      uMoonDir: { value: new THREE.Vector3(...MOON_DIR) },
      uTime: { value: 0 },
      uSigma: { value: 0.02 },
    }),
    [noise],
  );

  useEffect(() => {
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noise.colorSpace = THREE.NoColorSpace;
  }, [noise]);

  // Per-card uniform maps that SHARE the common objects by reference, so the frame loop
  // below writes time and density once rather than once per card.
  const uniforms = useMemo(
    () =>
      cards.map((c) => ({
        ...shared,
        uSeed: { value: c.seed },
        uDensity: { value: c.density },
      })),
    [cards, shared],
  );

  useFrame((state) => {
    shared.uTime.value = state.clock.elapsedTime;
    shared.uSigma.value = scroll.fogSigma;
  });

  if (config.fogCards === 0) return null;

  return (
    <group>
      {cards.map((c, i) => (
        <mesh
          key={i}
          position={c.pos}
          rotation={[0, c.rotY, 0]}
          renderOrder={c.order}
          frustumCulled
        >
          <planeGeometry args={[c.scale[0], c.scale[1], 1, 1]} />
          <shaderMaterial
            vertexShader={cardVert}
            fragmentShader={cardFrag}
            uniforms={uniforms[i]}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.NormalBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function Fog({ config }: { config: TierConfig }) {
  return (
    <>
      <FogDriver />
      <FogCards config={config} />
    </>
  );
}
