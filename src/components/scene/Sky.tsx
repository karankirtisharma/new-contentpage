'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { MOON_DIR, PALETTE } from '@/lib/world';
import type { TierConfig } from '@/lib/tier';

/**
 * Sky, moon and stars — matched to the owner's reference frame.
 *
 * The reference settles two things the master doc got half right:
 *   1. The GROUND is lunar rock: cratered regolith with scattered boulders, not a
 *      plane. That is Terrain's job.
 *   2. A huge CRATERED moon hangs in the sky above it, large in frame (~23 deg), with a
 *      hot emerald limb. Both are true at once; they were never alternatives.
 *
 * The same crater/regolith texture set feeds both, which is exactly why they read as one
 * world: the rock under the camera and the disc in the sky are the same material.
 *
 * Nothing here receives fog — a distance-fogged sky is just a flat colour. The dome's
 * horizon colour is authored to EQUAL the fog's far colour instead, which is what makes
 * corridor geometry dissolve into the sky rather than ending against it.
 *
 * Draw order: dome (-3) -> nebula (-2) -> stars (-1) -> moon (0).
 *
 * Everything here lives in ONE group that TRANSLATE-follows the camera. That is the
 * anchor rule and it is not optional: the corridor is ~254 units long, so a world-fixed
 * moon at 220 units would swell from 17 degrees to ~41 and swing 60 degrees off-axis by
 * the finale, and the camera would end up standing inside the star shells. Following the
 * camera keeps the sky's apparent size and bearing constant; a 3% parallax lag gives it
 * ~7-8 units of authored drift across the ride so it is alive without lurching.
 *
 * Nothing in this file receives fog — a distance-fogged sky is just a flat colour. The
 * dome's horizon colour is instead authored to EQUAL the fog's far colour, which is what
 * makes corridor geometry dissolve into the sky rather than ending against it.
 *
 * Draw order: dome (-3) -> nebula (-2) -> stars (-1) -> moon (0). The first three
 * disable depth entirely and are painted over by the opaque world.
 */

const MOON_DISTANCE = 220;
const MOON_RADIUS = 45; // theta = 2*atan(45/220) ~ 23 deg: dominant, as in the reference
const DOME_RADIUS = 280;
const PARALLAX = 0.03;

// ---------------------------------------------------------------- sky dome

const domeVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFrag = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  varying vec3 vDir;
  void main() {
    // Curve biased low so the horizon band is thin and the sky is black overhead.
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    float k = pow(clamp(vDir.y, 0.0, 1.0), 0.55);
    vec3 col = mix(uHorizon, uZenith, k);
    // A whisper of extra lift right at the horizon line so terrain has something to
    // dissolve INTO rather than a hard edge.
    col += uHorizon * pow(1.0 - abs(vDir.y), 22.0) * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Dome() {
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color(PALETTE.black) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
    }),
    [],
  );
  return (
    <mesh renderOrder={-3} frustumCulled={false}>
      <sphereGeometry args={[DOME_RADIUS, 32, 20]} />
      <shaderMaterial
        vertexShader={domeVert}
        fragmentShader={domeFrag}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------- stars

const starVert = /* glsl */ `
  uniform float uDpr;
  attribute float aSize;
  attribute float aBright;
  attribute float aPhase;
  varying float vBright;
  varying float vPhase;
  void main() {
    vBright = aBright;
    vPhase = aPhase;
    // Size attenuation OFF: at shell distance every star is effectively at infinity, so
    // perspective scaling only produces shimmer. Magnitude comes from the attribute.
    gl_PointSize = aSize * uDpr;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const starFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying float vBright;
  varying float vPhase;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float disc = smoothstep(0.5, 0.12, length(c));
    if (disc <= 0.001) discard;
    // Twinkle is BRIGHTNESS ONLY and only on the bright class — modulating size makes
    // a starfield strobe.
    float tw = mix(1.0, 0.84 + 0.16 * sin(uTime * 1.7 + vPhase * 6.28), step(0.66, vBright));
    gl_FragColor = vec4(uColor * vBright * tw, disc);
  }
`;

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function StarShell({ radius, count, seed, dim }: { radius: number; count: number; seed: number; dim: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const gl = useThree((s) => s.gl);

  const geometry = useMemo(() => {
    const rand = makeRng(seed);
    const pos: number[] = [];
    const size: number[] = [];
    const bright: number[] = [];
    const phase: number[] = [];
    const moon = new THREE.Vector3(...MOON_DIR);

    let guard = 0;
    while (pos.length / 3 < count && guard < count * 40) {
      guard++;
      const z = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      const d = new THREE.Vector3(r * Math.cos(th), z, r * Math.sin(th));

      // Thin the field toward the horizon and around the moon: both are composition
      // decisions, and an even field is exactly what reads as "starfield wallpaper".
      if (d.y < 0.02) continue;
      if (rand() > THREE.MathUtils.smoothstep(d.y, 0.02, 0.45) * 0.85 + 0.15) continue;
      if (d.dot(moon) > 0.978 && rand() < 0.85) continue;

      pos.push(d.x * radius, d.y * radius, d.z * radius);
      // Three magnitude classes: 70% faint, 25% mid, 5% bright.
      const roll = rand();
      if (roll < 0.7) {
        size.push(1.0);
        bright.push(0.38 + rand() * 0.18);
      } else if (roll < 0.95) {
        size.push(1.7);
        bright.push(0.62 + rand() * 0.18);
      } else {
        size.push(2.6);
        bright.push(0.9 + rand() * 0.3);
      }
      phase.push(rand());
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright.map((b) => b * dim), 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * 1.01);
    return g;
  }, [radius, count, seed, dim]);

  // Dispose only a superseded geometry (see the note in Rocks.tsx).
  const prevGeom = useRef<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    const old = prevGeom.current;
    prevGeom.current = geometry;
    if (old && old !== geometry) old.dispose();
  }, [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDpr: { value: Math.min(gl.getPixelRatio(), 2) },
      uColor: { value: new THREE.Color('#cfe8dd') },
    }),
    [gl],
  );

  useFrame((s) => {
    const u = mat.current?.uniforms;
    if (u) u.uTime.value = s.clock.elapsedTime;
  });

  return (
    <points geometry={geometry} renderOrder={-1} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={starVert}
        fragmentShader={starFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        fog={false}
        toneMapped={false}
      />
    </points>
  );
}

// ---------------------------------------------------------------- nebula

function Nebula() {
  const tex = useTexture('/textures/nebula.png');
  const pos = useMemo(() => new THREE.Vector3(...MOON_DIR).multiplyScalar(268), []);
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...MOON_DIR));
    return q;
  }, []);

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
  }, [tex]);

  return (
    <mesh position={pos} quaternion={quat} renderOrder={-2} frustumCulled={false}>
      <planeGeometry args={[300, 150]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={0.32}
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------- moon

/**
 * The moon lives on layer 2 with its OWN directional light, also on layer 2. three
 * matches lights to objects by layer intersection (verified empirically — toggling this
 * light leaves world pixels bit-identical), so its key can be far brighter than the
 * corridor's without washing out the ground, and the corridor's lights never touch it.
 * Both point along MOON_DIR, so its terminator agrees with the light raking the regolith
 * below — the single most important cue that sky and ground share one world.
 */
function Moon() {
  const albedo = useTexture('/textures/lunar_albedo.png');
  const normal = useTexture('/textures/lunar_normal.png');
  const mesh = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const pos = useMemo(() => new THREE.Vector3(...MOON_DIR).multiplyScalar(MOON_DISTANCE), []);

  useEffect(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    albedo.anisotropy = 4;
    normal.colorSpace = THREE.NoColorSpace;
  }, [albedo, normal]);

  useEffect(() => {
    if (mesh.current) mesh.current.layers.set(2);
    if (!light.current) return;
    light.current.layers.set(2);
    if (!target.current) return;
    // Rake the key ACROSS the disc rather than pointing it back at the camera. Aiming it
    // down MOON_DIR lights the face we are looking at and the moon reads as a flat grey
    // full moon; offsetting the source up-and-right of the body puts the terminator
    // inside the visible disc and throws the hot limb onto the upper-right edge — the
    // crescent in the reference frame.
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, new THREE.Vector3(...MOON_DIR)).normalize();
    light.current.target = target.current;
    target.current.position.copy(pos);
    light.current.position
      .copy(pos)
      .addScaledVector(right, -300)
      .addScaledVector(up, 150);
  }, [pos]);

  // Terminator + rim, injected into emissive so no lighting chunk is monkey-patched
  // (those move between three releases; emissive is stable).
  const uniforms = useMemo(
    () => ({
      uMoonDir: { value: new THREE.Vector3(...MOON_DIR) },
      uRimColor: { value: new THREE.Color('#8fffb8') },
      uFillColor: { value: new THREE.Color('#0d3324') },
    }),
    [],
  );

  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uMoonDir = uniforms.uMoonDir;
      shader.uniforms.uRimColor = uniforms.uRimColor;
      shader.uniforms.uFillColor = uniforms.uFillColor;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vNormalW;\nvarying vec3 vViewW;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec4 mvPosW = modelMatrix * vec4(transformed, 1.0);
           vNormalW = normalize(mat3(modelMatrix) * objectNormal);
           vViewW = normalize(cameraPosition - mvPosW.xyz);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vNormalW;
           varying vec3 vViewW;
           uniform vec3 uMoonDir;
           uniform vec3 uRimColor;
           uniform vec3 uFillColor;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           vec3 nW = normalize(vNormalW);
           float ndl = dot(nW, uMoonDir);
           // Airless body: the terminator stays HARD. This softens only the last pixel
           // so the limb does not alias.
           float wrap = pow(clamp(ndl * 0.5 + 0.5, 0.0, 1.0), 2.4);
           totalEmissiveRadiance += uFillColor * wrap * 0.45;
           // The hot emerald limb from the reference: a tight bright crescent on the lit
           // edge. This is the ONE element in the sky deliberately pushed past the bloom
           // threshold, so it blooms and nothing else up there does.
           float fres = pow(1.0 - clamp(dot(nW, normalize(vViewW)), 0.0, 1.0), 2.6);
           totalEmissiveRadiance += uRimColor * fres * smoothstep(-0.15, 0.75, ndl) * 2.2;`,
        );
    };
    mat.customProgramCacheKey = () => 'moon-rim-v2';
    mat.needsUpdate = true;
  }, [uniforms]);

  return (
    <>
      <object3D ref={target} />
      <directionalLight ref={light} position={pos} intensity={3.6} color={PALETTE.moonDisc} />
      <mesh ref={mesh} position={pos} renderOrder={0} frustumCulled={false}>
        <sphereGeometry args={[MOON_RADIUS, 64, 40]} />
        <meshStandardMaterial
          ref={matRef}
          map={albedo}
          normalMap={normal}
          normalScale={new THREE.Vector2(0.9, 0.9)}
          roughness={1}
          metalness={0}
          fog={false}
        />
      </mesh>
    </>
  );
}

// ---------------------------------------------------------------- composite

export default function Sky({ config }: { config: TierConfig }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const start = useRef<THREE.Vector3 | null>(null);

  // The moon renders on layer 2; without this the camera never sees it.
  useEffect(() => {
    camera.layers.enable(2);
    return () => {
      camera.layers.disable(2);
    };
  }, [camera]);

  useFrame(({ camera: cam }) => {
    const g = group.current;
    if (!g) return;
    if (!start.current) start.current = cam.position.clone();
    // Translate-follow with a 3% parallax lag (see the header note).
    const s = start.current;
    g.position.set(
      cam.position.x - (cam.position.x - s.x) * PARALLAX,
      cam.position.y - (cam.position.y - s.y) * PARALLAX,
      cam.position.z - (cam.position.z - s.z) * PARALLAX,
    );
  });

  return (
    <group ref={group}>
      <Dome />
      {config.stars > 0 && (
        <>
          <Nebula />
          <StarShell radius={240} count={Math.round(config.stars * 0.55)} seed={0x51a71} dim={1} />
          {config.starShells === 2 && (
            <StarShell radius={265} count={Math.round(config.stars * 0.45)} seed={0x51a72} dim={0.78} />
          )}
        </>
      )}
      <Moon />
    </group>
  );
}
