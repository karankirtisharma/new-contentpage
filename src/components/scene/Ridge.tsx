'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE, TERRAIN } from '@/lib/world';
import { mulberry32, ridged } from '@/lib/terrainNoise';
import { FOG_PARS, fogUniforms } from '@/lib/fog';
import type { TierConfig } from '@/lib/tier';

/**
 * Distant massifs — the jagged horizon from the owner's reference frame.
 *
 * A world-fixed ring of ridged peaks centred on the corridor midpoint, plus an optional
 * nearer flank layer. World-fixed is the point: the camera travels ~254 units past them,
 * which is exactly the slow genuine parallax the brief asks for in section 20. Parenting
 * them to the camera would flatten them into a painted backdrop.
 *
 * The rings live beyond the terrain sheet (radius 205 and 240 vs its ~186 corner), and
 * the far plane is 420 to hold them. They are unlit silhouettes: a gradient
 * from near-black bases to the sky's own horizon colour at the peaks, so they dissolve
 * into the atmosphere rather than ending against it.
 */

const vert = /* glsl */ `
  varying float vH;
  varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vH = position.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const frag = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uPeak;
  uniform float uHeight;
  varying float vH;
  varying vec3 vW;
${FOG_PARS}
  void main() {
    // Peaks lift toward the horizon colour; bases stay near-black, so a ridge reads as
    // distant even before the fog reaches it.
    float k = clamp(vH / uHeight, 0.0, 1.0);
    vec3 col = mix(uBase, uPeak, pow(k, 0.75));
    // These are the furthest solid things in the world; the atmosphere is most of what
    // the viewer actually sees of them.
    gl_FragColor = vec4(applyLunarFog(col, vW), 1.0);
  }
`;

function buildRidge(radius: number, height: number, segments: number, seed: number, jag: number) {
  const g = new THREE.CylinderGeometry(radius, radius, height, segments, 3, true);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rand = mulberry32(seed);
  const phase = rand() * 100;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    // Ridged noise around the ring: sharp crests, not rolling hills.
    const r1 = ridged(Math.cos(ang) * 40 + phase, Math.sin(ang) * 40, 4, 1 / 9);
    const r2 = ridged(Math.cos(ang) * 120 + phase, Math.sin(ang) * 120, 3, 1 / 5);
    const profile = (r1 * 0.7 + r2 * 0.3) * jag;

    // Only the top ring rises — the base stays flat so it meets the terrain cleanly.
    const isTop = y > height * 0.24;
    const lift = isTop ? profile * height * 0.9 : 0;
    const rr = radius * (1 + profile * 0.03);
    pos.setXYZ(i, Math.cos(ang) * rr, y + lift - height * 0.5, Math.sin(ang) * rr);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export default function Ridge({ config }: { config: TierConfig }) {
  // Both rings must sit OUTSIDE the terrain sheet's corner radius (~186) or they slice
  // through it: the first pass put the flank ring at 118 and it carved long parallel
  // gashes clean across the travelled corridor.
  const main = useMemo(() => buildRidge(240, 78, 240, 0x21d6e, 0.9), []);
  const flank = useMemo(
    () => (config.ridgeFlanks ? buildRidge(205, 44, 200, 0x9f14c, 0.75) : null),
    [config.ridgeFlanks],
  );

  const uniformsFar = useMemo(
    () => ({
      ...fogUniforms,
      uBase: { value: new THREE.Color('#040705') },
      uPeak: { value: new THREE.Color(PALETTE.horizon) },
      uHeight: { value: 40 },
    }),
    [],
  );
  const uniformsNear = useMemo(
    () => ({
      ...fogUniforms,
      uBase: { value: new THREE.Color('#030604') },
      uPeak: { value: new THREE.Color('#0c1b13') },
      uHeight: { value: 24 },
    }),
    [],
  );

  useEffect(
    () => () => {
      main.dispose();
      flank?.dispose();
    },
    [main, flank],
  );

  return (
    <group position={[TERRAIN.center[0], -4, TERRAIN.center[2]]}>
      <mesh geometry={main} renderOrder={-1} frustumCulled={false}>
        <shaderMaterial
          vertexShader={vert}
          fragmentShader={frag}
          uniforms={uniformsFar}
          side={THREE.BackSide}
          fog={false}
          toneMapped={false}
          depthWrite
        />
      </mesh>
      {flank && (
        <mesh geometry={flank} position={[0, 1, 0]} frustumCulled={false}>
          <shaderMaterial
            vertexShader={vert}
            fragmentShader={frag}
            uniforms={uniformsNear}
            side={THREE.BackSide}
            fog={false}
            toneMapped={false}
            depthWrite
          />
        </mesh>
      )}
    </group>
  );
}
