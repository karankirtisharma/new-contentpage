'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { MOON_DIR, PADS, PALETTE, SIGNAL_PATH, TERRAIN } from '@/lib/world';
import { PAD_LIST, heightAt } from '@/lib/terrain';
import { patchFog } from '@/lib/fog';
import type { TierConfig } from '@/lib/tier';

/**
 * THE LUNAR SURFACE.
 *
 * This is the land the camera flies over, and per the owner's reference frame it is the
 * hero of every wide shot: cratered regolith, jagged massifs on the flanks, station
 * shelves cut into it. It replaces the old flat 110x110 grid plane entirely.
 *
 * Built ONCE on the CPU (master doc 2B): heights are written straight into the
 * BufferGeometry and `computeVertexNormals()` gives exact normals. Nothing here runs per
 * frame except a handful of uniform writes. The same `height()` closure that shapes this
 * mesh also places the boulders and seats the machines, so they cannot disagree.
 *
 * The material is a patched MeshStandardMaterial, not a raw ShaderMaterial: it has to
 * receive the moon key, the practical pool and (from Phase 4) the shared fog chunk. The
 * old floor was raw and unlit, which is exactly why its "light pools" had to be painted
 * on by hand.
 */

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNrm;
`;

export default function Terrain({
  config,
  materialRef,
}: {
  config: TierConfig;
  materialRef?: React.RefObject<THREE.MeshStandardMaterial | null>;
}) {
  const [detail, noise] = useTexture(['/textures/regolith_normal.png', '/textures/noise_rg.png']);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    detail.wrapS = THREE.RepeatWrapping;
    detail.wrapT = THREE.RepeatWrapping;
    detail.colorSpace = THREE.NoColorSpace;
    detail.anisotropy = 16;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noise.colorSpace = THREE.NoColorSpace;
  }, [detail, noise]);

  // ---------------------------------------------------------------- geometry
  const geometry = useMemo(() => {
    const [segX, segZ] = config.terrain;
    const g = new THREE.PlaneGeometry(TERRAIN.width, TERRAIN.depth, segX, segZ);
    g.rotateX(-Math.PI / 2);

    const pos = g.attributes.position as THREE.BufferAttribute;
    const cx = TERRAIN.center[0];
    const cz = TERRAIN.center[2];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      pos.setY(i, heightAt(x, z));
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [config.terrain]);

  // Dispose only a superseded geometry — see the note in Rocks.tsx: disposing on
  // StrictMode's unmount kills the geometry the remount reuses.
  const prevGeom = useRef<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    const old = prevGeom.current;
    prevGeom.current = geometry;
    if (old && old !== geometry) old.dispose();
  }, [geometry]);

  // ---------------------------------------------------------------- uniforms
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLow: { value: new THREE.Color(PALETTE.terrainLow) },
      uHigh: { value: new THREE.Color(PALETTE.terrainHigh) },
      uMoonDir: { value: new THREE.Vector3(...MOON_DIR) },
      uDetail: { value: detail },
      uNoise: { value: noise },
      uDetailScale: { value: 0.16 },
      uDetailAmount: { value: config.detailNormal === 'off' ? 0 : 0.22 },
      // Per-pad contact darkening (x, z, radius, strength). This replaces drei
      // ContactShadows entirely: zero draw calls, zero render targets, and it composes
      // with the slope shading instead of sitting on top of it as a grey disc.
      uPadShadow: {
        value: PAD_LIST.map(
          (p) => new THREE.Vector4(p.x, p.z, PADS[PAD_LIST.indexOf(p)]?.rInner ?? 7, 0.62),
        ),
      },
      // Emitter pool for the emerald light spill (filled by the lighting rig in Phase 5).
      uEmitters: { value: PAD_LIST.map((p) => new THREE.Vector3(p.x, p.y + 1.2, p.z)) },
      uEmitterStr: { value: new Float32Array(6) },
      uEmitterColor: { value: new THREE.Color(PALETTE.practical) },
      // --- the buried Signal seam (3G). These are written every frame by
      // SignalNetwork.tsx through this material's ref: the seam has to be shaded by the
      // surface it is buried in, or it floats above the ground.
      uSeamPath: { value: SIGNAL_PATH.map(([x, z]) => new THREE.Vector2(x, z)) },
      uSeamPulsePos: { value: new THREE.Vector2(0, 0) },
      uSeamPulseStr: { value: 0 },
      uSeamAmbient: { value: 0.02 },
    }),
    [detail, noise, config.detailNormal],
  );

  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    // Hand the uniform objects to whoever else needs to drive them. They are shared by
    // reference into the compiled program, so a write here lands on the GPU (Trap #1
    // applies to ShaderMaterial's cloned `uniforms` prop, a different mechanism).
    mat.userData.signalUniforms = uniforms;
    if (materialRef) materialRef.current = mat;

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      patchFog(shader);

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${vertexShader}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
           vNrm = normalize(mat3(modelMatrix) * objectNormal);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWorld;
           varying vec3 vNrm;
           uniform vec3 uLow;
           uniform vec3 uHigh;
           uniform vec3 uMoonDir;
           uniform sampler2D uDetail;
           uniform sampler2D uNoise;
           uniform float uDetailScale;
           uniform float uDetailAmount;
           uniform vec4 uPadShadow[6];
           uniform vec3 uEmitters[6];
           uniform float uEmitterStr[6];
           uniform vec3 uEmitterColor;
           uniform vec2 uSeamPath[8];
           uniform vec2 uSeamPulsePos;
           uniform float uSeamPulseStr;
           uniform float uSeamAmbient;`,
        )
        // --- albedo: slope + height ramp, detail normal, pad contact darkening
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float slope = 1.0 - clamp(vNrm.y, 0.0, 1.0);
           float hNorm = clamp((vWorld.y + 6.0) / 22.0, 0.0, 1.0);
           // Regolith: near-black in the hollows, charcoal on lit flats, and the steep
           // faces stay darkest of all so the massifs read as silhouettes.
           vec3 rock = mix(uLow, uHigh, hNorm * 0.75 + 0.25);
           rock = mix(rock, uLow * 0.45, smoothstep(0.25, 0.75, slope));

           // Albedo break-up. Height and slope are both smooth fields, so an albedo driven
           // only by them is smooth too — which is why the regolith read as one shaded blob
           // no matter how much relief the geometry had. Two octaves of the same tiling
           // noise, at wavelengths well above the detail normal's, give the mare-and-
           // highland patchiness that makes lunar photography legible.
           float mare = texture2D(uNoise, vWorld.xz * 0.0075).r;
           float grain = texture2D(uNoise, vWorld.xz * 0.028).g;
           rock *= 0.72 + 0.44 * mare + 0.20 * (grain - 0.5);

           diffuseColor.rgb *= rock * 0.85;

           // Contact darkening under each machine — grounding, at zero draw-call cost.
           for (int i = 0; i < 6; i++) {
             float d = distance(vWorld.xz, uPadShadow[i].xy);
             float k = 1.0 - smoothstep(0.0, uPadShadow[i].z, d);
             diffuseColor.rgb *= 1.0 - uPadShadow[i].w * k * k;
           }`,
        )
        // --- fine relief from the tiled regolith normal, faded on steep faces where a
        //     planar projection would stretch
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
           if (uDetailAmount > 0.0) {
             ${
               config.detailNormal === 'triplanar'
                 ? `// Three projections blended by |normal|: the XZ plane alone stretches to
                    // infinity down a vertical face, which is what streaked every slope.
                    vec3 an = abs(vNrm);
                    vec3 bw = an / max(an.x + an.y + an.z, 1e-4);
                    vec2 nx = texture2D(uDetail, vWorld.zy * uDetailScale).xy * 2.0 - 1.0;
                    vec2 ny = texture2D(uDetail, vWorld.xz * uDetailScale).xy * 2.0 - 1.0;
                    vec2 nz = texture2D(uDetail, vWorld.xy * uDetailScale).xy * 2.0 - 1.0;
                    vec3 bump = vec3(0.0, nx.x, nx.y) * bw.x
                              + vec3(ny.x, 0.0, ny.y) * bw.y
                              + vec3(nz.x, nz.y, 0.0) * bw.z;
                    float dFade = 1.0 - smoothstep(10.0, 46.0, distance(vWorld, cameraPosition));
                    normal = normalize(normal + bump * uDetailAmount * dFade);`
                 : `vec3 dn = texture2D(uDetail, vWorld.xz * uDetailScale).xyz * 2.0 - 1.0;
                    float fade = uDetailAmount * (1.0 - smoothstep(0.35, 0.8, slope))
                                * (1.0 - smoothstep(10.0, 46.0, distance(vWorld, cameraPosition)));
                    normal = normalize(normal + vec3(dn.x, 0.0, dn.y) * fade);`
             }
           }`,
        )
        // --- emerald spill from the machines, plus the buried seam (Phase 7)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           for (int i = 0; i < 6; i++) {
             if (uEmitterStr[i] <= 0.001) continue;
             vec3 toL = uEmitters[i] - vWorld;
             float dist = length(toL);
             float atten = 1.0 / (1.0 + dist * dist * 0.06);
             float lam = max(dot(normalize(vNrm), normalize(toL)), 0.0);
             totalEmissiveRadiance += uEmitterColor * lam * atten * uEmitterStr[i] * 0.55;
           }

           // --- the buried Signal seam: distance to a 7-segment polyline, pure ALU.
           // It sits around 2% intensity, deliberately under the threshold where the eye
           // resolves a stripe, and only lifts where a pulse is passing over it. That is
           // the whole difference between infrastructure and a neon road.
           {
             float sd = 1e9;
             for (int i = 0; i < 7; i++) {
               vec2 a = uSeamPath[i];
               vec2 ba = uSeamPath[i + 1] - a;
               vec2 pa = vWorld.xz - a;
               float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
               sd = min(sd, length(pa - ba * h));
             }
             // Minimum width in SCREEN space, not world space. Half a world unit is a
             // clean seam underfoot and less than one pixel from the finale crane ninety
             // metres up — where the network is supposed to become the one legible image
             // of the piece, and instead aliased into nothing. fwidth gives world units
             // per pixel here, so the line never falls below about two pixels however far
             // away it is, and never widens into a stripe up close.
             float px = fwidth(sd);
             float w = max(0.5, px * 2.0);
             float core = 1.0 - smoothstep(0.0, w, sd);
             float halo = 1.0 - smoothstep(w * 0.7, max(2.4, px * 9.0), sd);
             float travelling =
               uSeamPulseStr * (1.0 - smoothstep(0.0, 11.0, distance(vWorld.xz, uSeamPulsePos)));
             float amt = uSeamAmbient + travelling * 0.33;
             totalEmissiveRadiance += uEmitterColor * (core * 0.72 + halo * 0.28) * amt;
           }`,
        );
    };

    mat.customProgramCacheKey = () => `lunar-terrain-v5-seamwidth-${config.detailNormal}`;
    mat.needsUpdate = true;
  }, [uniforms, config.detailNormal, materialRef]);

  // Uniform objects are shared BY REFERENCE into the compiled shader via
  // onBeforeCompile, so writing the memoised object here does reach the GPU. (Trap #1
  // bites ShaderMaterial's cloned `uniforms` PROP, which is a different mechanism.)
  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh geometry={geometry} position={TERRAIN.center} receiveShadow frustumCulled={false}>
      <meshStandardMaterial
        ref={matRef}
        color="#ffffff"
        roughness={0.96}
        metalness={0.02}
        envMapIntensity={0.25}
      />
    </mesh>
  );
}
