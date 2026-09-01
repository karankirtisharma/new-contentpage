import * as THREE from 'three';
import { patchFog } from './fog';

/**
 * The six web GLBs shipped WITHOUT the emissive step from §9.3 of the plan — they still
 * carry Tripo's flat normal map (mean RGB 127.7/127.0/253.6, sigma ~5 = a flat normal
 * plus JPEG noise) and the blotchy per-UV-island roughness/metal map.
 *
 * Rather than re-running the offline pipeline, the same mask runs in the fragment shader:
 *
 *     green = (G - max(R,B) > 0.07) && (value > 0.22)
 *     white = (value > 0.80) && (saturation < 0.12)   // paper / bright panels, soft
 *     mask  = clamp(green + 0.35 * white, 0, 1)
 *     emissive = basecolor * mask * tint(0.62, 1.0, 0.70) * strength
 *
 * Identical logic to emissive.py, three wins over baking it:
 *   - no second 2K texture per station (~16 MB VRAM each saved)
 *   - `uStrength` is a uniform, so breathing / ignition / flash are free
 *   - `uSeq` gives the machine its hub-to-panel gradient without a second material
 *
 * The mask thresholds are sRGB, so the linear `diffuseColor` is re-encoded first.
 */

export type EmissiveUniforms = {
  uStrength: { value: number };
  /** Machine only: 0..1 sweep along local X that gates the ignition. -1 disables. */
  uSeq: { value: number };
  /** Extra multiplier, used for hover pulses and the booth flash. */
  uBoost: { value: number };
  /** Region mask along local Y: emissive below this normalised height is damped. */
  uFloorMask: { value: number };
};

const EMISSIVE_CHUNK = /* glsl */ `
  // --- derived emissive (port of emissive.py) ---
  vec3 srgbC = pow(max(diffuseColor.rgb, 0.0), vec3(0.4545454545));
  float mxC = max(srgbC.r, max(srgbC.g, srgbC.b));
  float mnC = min(srgbC.r, min(srgbC.g, srgbC.b));
  float satC = (mxC - mnC) / max(mxC, 1e-6);
  float greenC = step(0.07, srgbC.g - max(srgbC.r, srgbC.b)) * step(0.22, mxC);
  float whiteC = step(0.80, mxC) * step(satC, 0.12);
  float maskC = clamp(greenC + 0.35 * whiteC, 0.0, 1.0);

  // sequential ignition along local X (machine); uSeq < 0 disables the gate
  float seqGate = 1.0;
  if (uSeq >= 0.0) {
    float sx = clamp(vLocalPos.x + 0.5, 0.0, 1.0);
    seqGate = smoothstep(sx - 0.14, sx + 0.02, uSeq);
  }

  // region damp along local Y (stage turntable disc must not bloom)
  float regionGate = uFloorMask <= 0.0
    ? 1.0
    : mix(0.12, 1.0, smoothstep(uFloorMask - 0.05, uFloorMask + 0.12, vLocalPos.y));

  vec3 derived = srgbC * maskC * vec3(0.62, 1.0, 0.70);
  totalEmissiveRadiance += derived * uStrength * uBoost * seqGate * regionGate;
`;

/**
 * Walks a loaded GLTF scene: strips the dead maps, forces the dielectric constants
 * from §1.3, and patches in the derived emissive. Returns the uniform block so the
 * station component can animate it per-frame.
 */
export function prepareStationMaterials(
  root: THREE.Object3D,
  opts: { strength: number; seq?: boolean; floorMask?: number },
): EmissiveUniforms {
  const uniforms: EmissiveUniforms = {
    uStrength: { value: opts.strength },
    uSeq: { value: opts.seq ? 0 : -1 },
    uBoost: { value: 1 },
    uFloorMask: { value: opts.floorMask ?? 0 },
  };

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((raw) => {
      const mat = raw as THREE.MeshStandardMaterial;
      if (!mat || !mat.isMeshStandardMaterial) return;

      // §1.3: the normal map is flat and the RM map is per-island patchy. Both go.
      mat.normalMap?.dispose();
      mat.normalMap = null;
      mat.metalnessMap?.dispose();
      mat.roughnessMap?.dispose();
      mat.metalnessMap = null;
      mat.roughnessMap = null;
      mat.roughness = 0.45;
      mat.metalness = 0.1;
      mat.envMapIntensity = 0.35;
      // Must be black: `totalEmissiveRadiance` is seeded from this before the derived
      // chunk runs, so any non-zero value makes every surface glow, not just the panels.
      mat.emissive = new THREE.Color(0x000000);
      mat.emissiveIntensity = 1;
      mat.side = THREE.FrontSide;
      mat.toneMapped = true;

      if (mat.map) {
        mat.map.anisotropy = 4;
        mat.map.colorSpace = THREE.SRGBColorSpace;
      }

      mat.onBeforeCompile = (shader) => {
        patchFog(shader);
        shader.uniforms.uStrength = uniforms.uStrength;
        shader.uniforms.uSeq = uniforms.uSeq;
        shader.uniforms.uBoost = uniforms.uBoost;
        shader.uniforms.uFloorMask = uniforms.uFloorMask;

        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
             varying vec3 vLocalPos;
             uniform float uStrength;
             uniform float uSeq;
             uniform float uBoost;
             uniform float uFloorMask;`,
          )
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${EMISSIVE_CHUNK}`);
      };

      // Force a recompile under the patched key so two stations never share a program.
      mat.customProgramCacheKey = () =>
        `signal-emissive-fog-${opts.strength}-${opts.seq ? 1 : 0}-${opts.floorMask ?? 0}`;
      mat.needsUpdate = true;
    });
  });

  return uniforms;
}

/** Full teardown for a station subtree. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const mat = m as THREE.MeshStandardMaterial;
      if (!mat) return;
      mat.map?.dispose();
      mat.emissiveMap?.dispose();
      mat.normalMap?.dispose();
      mat.roughnessMap?.dispose();
      mat.metalnessMap?.dispose();
      mat.dispose();
    });
  });
}
