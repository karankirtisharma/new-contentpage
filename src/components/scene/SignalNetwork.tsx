'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, SIGNAL_PATH, STATIONS } from '@/lib/world';
import { heightAt } from '@/lib/terrain';
import { patchFog } from '@/lib/fog';
import { scroll } from '@/lib/store';
import type { TierConfig } from '@/lib/tier';

/**
 * THE SIGNAL — master doc 3G.
 *
 * This replaces the glowing tube that used to run the length of the corridor. The tube
 * was the single largest violation of the brief: it drew a neon road through the middle
 * of every frame and told the visitor exactly where to look, which is the opposite of
 * "mysterious, guiding without a neon road".
 *
 * What replaces it is INFRASTRUCTURE — the kind you notice on second viewing:
 *
 *   SEAM    · a buried line in the regolith, evaluated as distance-to-polyline inside the
 *             terrain's own fragment shader. It sits at about 2% intensity, which is under
 *             the threshold where the eye reads a stripe, and only brightens where a pulse
 *             is passing over it.
 *   NODES   · low pucks set into the ground every ten units or so, one instanced draw.
 *   CABLES  · six short arcs from the nearest node up into each machine's base. They exist
 *             to answer "how are these connected?" at close range, and nothing else.
 *   BEACONS · three light pillars far off the corridor. They are the world signalling to
 *             itself while the visitor reads, and they give the fog something to catch.
 *   PULSE   · one shared path parameter, driven from `scroll.t` exactly as the old
 *             conduit's `uProgress` was, so the scroll-sync architecture survives the
 *             change of visual entirely.
 *
 * The seam's uniforms live on the TERRAIN material, not here, and this component writes
 * them through a ref. That is deliberate: the seam has to be shaded by the same surface
 * that receives the moon key and the fog, or it floats above the ground it is buried in.
 */

// ---------------------------------------------------------------- shared path

/** The polyline, as flat (x, z) pairs — the form the terrain shader wants. */
export const SEAM_XZ = SIGNAL_PATH.map((p) => new THREE.Vector2(p[0], p[1]));

/** Cumulative arc length, so the pulse can travel at a constant world speed. */
const SEAM_CUM = (() => {
  const out = [0];
  for (let i = 1; i < SEAM_XZ.length; i++) out.push(out[i - 1] + SEAM_XZ[i].distanceTo(SEAM_XZ[i - 1]));
  return out;
})();
const SEAM_LEN = SEAM_CUM[SEAM_CUM.length - 1];

/** Point on the seam at arc length `s`, in world XZ. */
function seamAt(s: number, out: THREE.Vector2) {
  const d = THREE.MathUtils.clamp(s, 0, SEAM_LEN);
  for (let i = 1; i < SEAM_CUM.length; i++) {
    if (d <= SEAM_CUM[i]) {
      const span = SEAM_CUM[i] - SEAM_CUM[i - 1];
      const f = span > 0 ? (d - SEAM_CUM[i - 1]) / span : 0;
      return out.copy(SEAM_XZ[i - 1]).lerp(SEAM_XZ[i], f);
    }
  }
  return out.copy(SEAM_XZ[SEAM_XZ.length - 1]);
}

// ---------------------------------------------------------------- node pucks

const NODE_SPACING = 10;

type NodeInfo = { x: number; y: number; z: number; s: number };

function buildNodes(): NodeInfo[] {
  const out: NodeInfo[] = [];
  const v = new THREE.Vector2();
  for (let s = 6; s < SEAM_LEN - 4; s += NODE_SPACING) {
    seamAt(s, v);
    out.push({ x: v.x, y: heightAt(v.x, v.y), z: v.y, s });
  }
  return out;
}

// ---------------------------------------------------------------- beacons

const beaconVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const beaconFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSwell;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    // A pillar, not a bar: dense at the base, gone by the top, feathered at both edges so
    // the quad's own outline never shows.
    float rise = 1.0 - smoothstep(0.0, 0.92, vUv.y);
    float edge = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.6);
    float a = rise * edge * uSwell * 0.5;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Beacon cadence — brief §24. Each swells over two to three seconds every twenty to forty,
 * on a seeded offset, so they never fire together and never look scheduled.
 */
const BEACONS = [
  { x: -64, z: -52, h: 26, period: 27, offset: 3, hue: '#3fe08f' },
  { x: 58, z: -142, h: 34, period: 34, offset: 15, hue: '#2fc47c' },
  { x: -55, z: -214, h: 22, period: 21, offset: 9, hue: '#4de79b' },
];

function swellAt(time: number, period: number, offset: number) {
  const phase = ((time + offset) % period) / period;
  // A 2.5s swell inside the period: quick in, slow out.
  const w = 2.5 / period;
  if (phase > w) return 0;
  const k = phase / w;
  return Math.sin(k * Math.PI) ** 1.6;
}

// ---------------------------------------------------------------- component

export default function SignalNetwork({
  config,
  terrain,
}: {
  config: TierConfig;
  terrain: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const nodes = useMemo(() => buildNodes(), []);
  const pucks = useRef<THREE.InstancedMesh>(null);
  const beaconRefs = useRef<(THREE.ShaderMaterial | null)[]>([]);
  const pulsePos = useRef(new THREE.Vector2());
  const scratch = useRef(new THREE.Vector2());

  // --- node pucks: one instanced draw, seated on the ground, tilted to nothing.
  const puckGeom = useMemo(() => new THREE.CylinderGeometry(0.62, 0.72, 0.22, 12), []);
  const puckMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#0a0f0c',
      roughness: 0.72,
      metalness: 0.35,
      emissive: new THREE.Color(0x000000),
    });
    m.onBeforeCompile = (shader) => {
      patchFog(shader);
      // Route the per-instance colour into EMISSIVE. three's instanceColor multiplies the
      // diffuse term and nothing else, so the first version lit every puck identically
      // from the material's own emissive and the pulse had no visible effect at all.
      // Reading vColor here gives each node its own brightness for one draw call.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += vColor.rgb * 0.9;`,
      );
    };
    m.customProgramCacheKey = () => 'signal-node-v3';
    return m;
  }, []);

  useEffect(() => {
    const mesh = pucks.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    nodes.forEach((n, i) => {
      dummy.position.set(n.x, n.y - 0.05, n.z);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodes]);

  useEffect(() => () => {
    puckGeom.dispose();
    puckMat.dispose();
  }, [puckGeom, puckMat]);

  // --- cable props: six short arcs, merged into ONE geometry. Six separate tubes would
  //     be six draw calls for props that are only legible at three of the twenty-five
  //     beats; merged, they cost one.
  const cables = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const st of STATIONS) {
      // nearest node to this machine
      let best = nodes[0];
      let bd = Infinity;
      for (const n of nodes) {
        const d = (n.x - st.position[0]) ** 2 + (n.z - st.position[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      if (!best) continue;
      const a = new THREE.Vector3(best.x, best.y + 0.08, best.z);
      const b = new THREE.Vector3(st.position[0], st.position[1] + 0.55, st.position[2]);
      const mid = a.clone().lerp(b, 0.5);
      // Sag: a cable run across regolith lies on the ground before it rises.
      mid.y = Math.min(a.y, b.y) - 0.18;
      const curve = new THREE.CatmullRomCurve3([a, mid, b]);
      parts.push(new THREE.TubeGeometry(curve, 8, 0.075, 5, false));
    }
    if (parts.length === 0) return null;
    // Manual merge: BufferGeometryUtils is a separate import for four lines of work.
    const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
    const idxTotal = parts.reduce((n, g) => n + (g.index?.count ?? 0), 0);
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const idx = new Uint32Array(idxTotal);
    let vo = 0;
    let io = 0;
    for (const g of parts) {
      const p = g.attributes.position.array as ArrayLike<number>;
      const nn = g.attributes.normal.array as ArrayLike<number>;
      pos.set(p, vo * 3);
      nor.set(nn, vo * 3);
      const gi = g.index!.array as ArrayLike<number>;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      vo += g.attributes.position.count;
      io += gi.length;
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setIndex(new THREE.BufferAttribute(idx, 1));
    merged.computeBoundingSphere();
    return merged;
  }, [nodes]);

  const cableMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#080c0a', roughness: 0.85, metalness: 0.3 });
    m.onBeforeCompile = (shader) => patchFog(shader);
    m.customProgramCacheKey = () => 'signal-cable-v1';
    return m;
  }, []);

  useEffect(() => () => {
    cables?.dispose();
    cableMat.dispose();
  }, [cables, cableMat]);

  // --- push the seam's static geometry into the terrain shader once it exists
  useEffect(() => {
    const mat = terrain.current;
    const u = mat?.userData.signalUniforms as Record<string, { value: unknown }> | undefined;
    if (!u) return;
    u.uSeamPath.value = SEAM_XZ;
  }, [terrain]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    // --- the pulse. The scroll drives the primary one, so the Signal is always exactly
    //     where the visitor is; a slow secondary loop keeps the network alive while the
    //     page is parked, which is most of the time a visitor actually spends here.
    const primary = SEAM_LEN * THREE.MathUtils.clamp(scroll.t * 1.08 - 0.02, 0, 1);
    const secondary = SEAM_LEN * ((time * 0.055) % 1);
    const usePrimary = scroll.speed > 0.06;
    seamAt(usePrimary ? primary : secondary, pulsePos.current);
    const pulseStr = usePrimary ? 1 : 0.55;

    // --- finale: once the crane is up, the whole seam holds a low glow. This is the one
    //     moment the network is meant to be legible as a single image.
    const finale = THREE.MathUtils.clamp((scroll.t - 0.88) / 0.06, 0, 1);

    const u = terrain.current?.userData.signalUniforms as
      | Record<string, { value: unknown }>
      | undefined;
    if (u) {
      (u.uSeamPulsePos.value as THREE.Vector2).copy(pulsePos.current);
      u.uSeamPulseStr.value = pulseStr;
      // The finale is the ONE moment the seam is meant to be read rather than noticed:
      // 2% is right for infrastructure underfoot and invisible from a crane two hundred
      // metres down the line, so the crane brings it up by an order of magnitude.
      u.uSeamAmbient.value = 0.02 + finale * 0.44;
    }

    // --- node pucks brighten as the pulse reaches them
    const mesh = pucks.current;
    if (mesh && mesh.instanceColor) {
      const c = new THREE.Color();
      const base = new THREE.Color(PALETTE.practical);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        seamAt(n.s, scratch.current);
        const d = scratch.current.distanceTo(pulsePos.current);
        const near = 1 - THREE.MathUtils.clamp(d / 13, 0, 1);
        const idle = 0.012 + 0.008 * Math.sin(time * 1.7 + i * 0.9);
        const k = Math.max(idle, near * near * 0.4 * pulseStr) + finale * 0.55;
        c.copy(base).multiplyScalar(k);
        mesh.setColorAt(i, c);
      }
      mesh.instanceColor.needsUpdate = true;
    }

    // --- beacons
    for (let i = 0; i < BEACONS.length; i++) {
      const m = beaconRefs.current[i];
      if (!m) continue;
      const b = BEACONS[i];
      // A beacon always fires while the visitor is parked at a station: the world is
      // signalling in the distance precisely when there is time to notice it.
      const parked = scroll.speed < 0.05 ? 0.35 : 0;
      m.uniforms.uSwell.value = Math.max(swellAt(time, b.period, b.offset), parked * 0.6);
    }
  });

  if (!config.bloom && config.dust === 0) {
    // The fallback tier draws none of this: without bloom the seam is invisible anyway,
    // and the pucks are geometry nobody can see.
    return null;
  }

  return (
    <group>
      <instancedMesh
        ref={pucks}
        args={[puckGeom, puckMat, nodes.length]}
        castShadow={false}
        receiveShadow
        frustumCulled={false}
      />
      {cables && <mesh geometry={cables} material={cableMat} frustumCulled={false} />}
      {BEACONS.map((b, i) => (
        <mesh
          key={i}
          position={[b.x, heightAt(b.x, b.z) + b.h / 2, b.z]}
          renderOrder={-40}
          frustumCulled={false}
        >
          <planeGeometry args={[7, b.h, 1, 1]} />
          <shaderMaterial
            ref={(el) => {
              beaconRefs.current[i] = el;
            }}
            vertexShader={beaconVert}
            fragmentShader={beaconFrag}
            uniforms={{
              uColor: { value: new THREE.Color(b.hue) },
              uSwell: { value: 0 },
            }}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}
