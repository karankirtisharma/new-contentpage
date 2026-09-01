'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { CORRIDOR, PADS, PALETTE, STATIONS } from '@/lib/world';
import { distToSegment, mulberry32 } from '@/lib/terrainNoise';
import { PAD_LIST, heightAt } from '@/lib/terrain';
import { patchFog } from '@/lib/fog';
import type { TierConfig } from '@/lib/tier';

/**
 * The boulder field.
 *
 * Two jobs, and the second is the one that matters most:
 *   1. Make the ground read as lunar rock rather than a displaced plane.
 *   2. FOREGROUND OCCLUSION — several boulders sit deliberately close to the camera
 *      corridor so they sweep past the lens during travel beats. Across every case study
 *      in the research this is the single highest physicality-per-triangle trick there
 *      is: nothing sells "I am moving through a place" like something big passing near
 *      the camera.
 *
 * Variants are generated procedurally (noise-displaced icosahedra, flattened bases)
 * rather than sourced as GLBs: no download weight, style matches the Tripo heroes, and
 * the whole field is deterministic from one seed so visual QA is reproducible.
 *
 * Drawn through a single BatchedMesh — one draw call AND per-instance frustum culling,
 * which InstancedMesh cannot do (it culls as one bounding sphere, so a 300-unit corridor
 * would draw every rock every frame).
 */

/**
 * DISPOSAL PATTERN (StrictMode-safe).
 *
 * `useEffect(() => () => thing.dispose(), [thing])` looks correct and is a trap here:
 * React StrictMode mounts, unmounts and remounts in dev, but `useMemo` keeps its value
 * across that cycle — so the cleanup disposes the very object the remount then reuses.
 * A disposed BatchedMesh has null `_matricesTexture`, and the next render dies with
 * "Cannot read properties of null (reading 'image')" with an entirely black canvas.
 *
 * Instead: dispose only a SUPERSEDED value, never the live one. The GPU context is torn
 * down wholesale when the canvas goes, so the last live object needs no explicit free.
 */
function useDisposeSuperseded<T>(current: T, dispose: (v: T) => void) {
  const prev = useRef<T | null>(null);
  useEffect(() => {
    const old = prev.current;
    prev.current = current;
    if (old && old !== current) dispose(old);
    // `dispose` is intentionally not a dep: it is only ever called on the old value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
}

function makeRockGeometry(detail: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const rand = mulberry32(seed);
  // Three octaves of value noise on the sphere, evaluated per vertex.
  const offs = Array.from({ length: 3 }, () => [rand() * 100, rand() * 100, rand() * 100]);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  const hash = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    let acc = 0;
    for (let dz = 0; dz < 2; dz++)
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const wgt =
            (dx ? u : 1 - u) * (dy ? vv : 1 - vv) * (dz ? w : 1 - w);
          acc += wgt * hash(xi + dx, yi + dy, zi + dz);
        }
    return acc * 2 - 1;
  };

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let d = 0;
    let amp = 0.30;
    let freq = 1.7;
    for (let o = 0; o < 3; o++) {
      d += amp * vnoise(n.x * freq + offs[o][0], n.y * freq + offs[o][1], n.z * freq + offs[o][2]);
      amp *= 0.5;
      freq *= 2.3;
    }
    v.multiplyScalar(1 + d);
    // Squash and flatten the base so boulders sit ON the ground, not embedded balls.
    v.y *= 0.72;
    if (v.y < -0.55) v.y = -0.55 - (v.y + 0.55) * 0.15;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export default function Rocks({ config }: { config: TierConfig }) {
  const detailTex = useTexture('/textures/regolith_normal.png');

  useEffect(() => {
    detailTex.wrapS = THREE.RepeatWrapping;
    detailTex.wrapT = THREE.RepeatWrapping;
    detailTex.colorSpace = THREE.NoColorSpace;
  }, [detailTex]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.terrainLow),
      roughness: 0.95,
      metalness: 0.02,
      envMapIntensity: 0.35,
    });
    if (config.detailNormal !== 'off') {
      // Triplanar detail so one tiling normal works on arbitrarily-oriented boulders.
      mat.onBeforeCompile = (shader) => {
      patchFog(shader);
        shader.uniforms.uDetail = { value: detailTex };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vRockW;\nvarying vec3 vRockN;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             vRockW = (modelMatrix * vec4(transformed, 1.0)).xyz;
             vRockN = normalize(mat3(modelMatrix) * objectNormal);`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vRockW;\nvarying vec3 vRockN;\nuniform sampler2D uDetail;',
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
             vec3 bw = pow(abs(vRockN), vec3(4.0));
             bw /= (bw.x + bw.y + bw.z);
             vec3 tX = texture2D(uDetail, vRockW.zy * 0.7).xyz * 2.0 - 1.0;
             vec3 tY = texture2D(uDetail, vRockW.xz * 0.7).xyz * 2.0 - 1.0;
             vec3 tZ = texture2D(uDetail, vRockW.xy * 0.7).xyz * 2.0 - 1.0;
             vec3 tri = tX * bw.x + tY * bw.y + tZ * bw.z;
             normal = normalize(normal + tri * 0.7);`,
          );
      };
      mat.customProgramCacheKey = () => 'rock-triplanar-v1';
    }
    return mat;
  }, [detailTex, config.detailNormal]);

  const batched = useMemo(() => {
    const variants = config.rockDetail.flatMap((d) => [
      makeRockGeometry(d, 0x1001 + d),
      makeRockGeometry(d, 0x2002 + d),
    ]);

    const rand = mulberry32(0xb0d1e5);
    type Placed = { m: THREE.Matrix4; geom: number };
    const placed: Placed[] = [];

    const padOf = (i: number) => PAD_LIST[i];
    const corridorDist = (x: number, z: number) => {
      let dMin = Infinity;
      for (let i = 0; i < CORRIDOR.length - 1; i++) {
        const d = distToSegment(x, z, CORRIDOR[i][0], CORRIDOR[i][1], CORRIDOR[i + 1][0], CORRIDOR[i + 1][1]);
        if (d < dMin) dMin = d;
      }
      return dMin;
    };

    const target = config.rocks;
    let guard = 0;
    const dummy = new THREE.Object3D();

    while (placed.length < target && guard < target * 60) {
      guard++;
      // Matched to the terrain sheet. Scattering over +-150 on an +-85 sheet did not
      // thin the field, it stranded four boulders in ten off the edge of the world.
      const x = (rand() - 0.5) * 168;
      const z = 40 - rand() * 318;

      const cd = corridorDist(x, z);
      // Reject anything that would sit ON the travelled line, but deliberately KEEP a
      // band just off it: those are the foreground occluders.
      if (cd < 4.5) continue;

      let onPad = false;
      for (let i = 0; i < PAD_LIST.length; i++) {
        const p = padOf(i);
        if (Math.hypot(x - p.x, z - p.z) < PADS[i].rInner + 3) { onPad = true; break; }
      }
      if (onPad) continue;

      // Bias the field: dense near the corridor (where it reads), thinning outward.
      const keep = cd < 14 ? 1 : 0.35 + 0.65 * Math.exp(-(cd - 14) / 55);
      if (rand() > keep) continue;

      const near = cd < 9;
      const s = near
        ? 0.6 + rand() * 1.0   // the occluders: big enough to sweep the lens
        : 0.5 + rand() * 2.0;

      const y = heightAt(x, z);
      dummy.position.set(x, y - s * 0.22, z); // sink ~20% so they bed into regolith
      dummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
      dummy.scale.set(s * (0.8 + rand() * 0.5), s * (0.7 + rand() * 0.5), s * (0.8 + rand() * 0.5));
      dummy.updateMatrix();
      placed.push({ m: dummy.matrix.clone(), geom: Math.floor(rand() * variants.length) });
    }

    const maxVerts = variants.reduce((n, g) => n + g.attributes.position.count, 0);
    const maxIdx = variants.reduce((n, g) => n + (g.index?.count ?? 0), 0);
    const mesh = new THREE.BatchedMesh(placed.length, maxVerts, maxIdx, material);
    const ids = variants.map((g) => mesh.addGeometry(g));
    placed.forEach((p) => {
      const inst = mesh.addInstance(ids[p.geom]);
      mesh.setMatrixAt(inst, p.m);
    });
    mesh.perObjectFrustumCulled = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    return { mesh, variants, count: placed.length };
  }, [config.rocks, config.rockDetail, material]);

  useDisposeSuperseded(batched, (b) => {
    b.mesh.dispose();
    b.variants.forEach((g) => g.dispose());
  });
  useDisposeSuperseded(material, (m) => m.dispose());

  return <primitive object={batched.mesh} />;
}

/** Exposed for the debug overlay / budget reporting. */
export function rockBudget(config: TierConfig) {
  return { requested: config.rocks, details: config.rockDetail, stations: STATIONS.length };
}
