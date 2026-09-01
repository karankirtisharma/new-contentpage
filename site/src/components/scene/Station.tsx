'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { chapterFromT, scroll } from '@/lib/store';
import { prepareStationMaterials, type EmissiveUniforms } from '@/lib/materials';
import type { Station as StationDef } from '@/lib/world';

/**
 * One machine on the Signal Line.
 *
 * Loads its GLB, hands the materials to the derived-emissive patch, then runs the
 * per-station idle motion from §6 entirely on refs and uniforms — no React state
 * touches the frame loop.
 *
 * Visibility policy (§4): a station is `visible` only while the camera is within
 * `window` chapters of it. Nothing is disposed while the page lives, so re-entering
 * a chapter never re-uploads a texture.
 */
export default function Station({ def }: { def: StationDef }) {
  const gltf = useGLTF(def.url);
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const uniforms = useRef<EmissiveUniforms | null>(null);
  const boothFlash = useRef(0);
  const spin = useRef(0);

  // One scene per station — useGLTF caches by URL, and every station uses a distinct file.
  const scene = useMemo(() => {
    const s = gltf.scene;
    s.updateMatrixWorld(true);
    return s;
  }, [gltf.scene]);

  useEffect(() => {
    uniforms.current = prepareStationMaterials(scene, {
      strength: def.emissive,
      seq: def.id === 'machine',
      // Mask the stage's turntable disc: only the canopy ring and console should glow.
      floorMask: def.id === 'stage' ? 0.36 : 0,
    });
  }, [scene, def.emissive, def.id]);

  useFrame((state, delta) => {
    const g = group.current;
    const u = uniforms.current;
    if (!g || !u) return;

    const t = scroll.t;
    const camChapter = chapterFromT(t);
    // The finale crane reveals the whole line at once, so the per-chapter visibility
    // window is lifted from the moment the crane starts — otherwise chapter 5 shows
    // one station and the "engine" payoff has nothing in it.
    const finale = t > 0.88;
    const near = finale || Math.abs(camChapter - def.chapter) <= def.window;
    if (g.visible !== near) g.visible = near;
    if (!near) return;

    const time = state.clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    const i = inner.current;

    if (finale) {
      // The crane reveal sits 25-40 units out, where fog and inverse-square lighting
      // reduce every machine to a silhouette. In the finale the stations carry
      // themselves: base emissive lifts ~2.6x so each reads as a lit beacon, and a
      // pulse runs the line station by station in Signal order.
      const crane = THREE.MathUtils.clamp((t - 0.88) / 0.06, 0, 1);
      const wave = (time * 0.32) % 1;
      const slot = def.chapter / 5;
      const d = Math.abs(((wave - slot + 1.5) % 1) - 0.5);
      const pulse = Math.exp(-Math.pow(d * 7.0, 2));
      const target = 1 + crane * (1.6 + pulse * 1.9);
      u.uBoost.value += (target - u.uBoost.value) * 0.12;
    } else if (def.id !== 'rig') {
      u.uBoost.value += (1 - u.uBoost.value) * 0.12;
    }

    switch (def.id) {
      case 'rig': {
        // "Running camera" jitter — 0.3px at hero framing, noise at ~4 Hz.
        if (i) {
          i.position.x = Math.sin(time * 25.3) * 0.0016 + Math.sin(time * 11.7) * 0.0011;
          i.position.y = Math.cos(time * 21.1) * 0.0014;
        }
        // Power-on: slates flicker at 8 Hz for the first 200 ms of the page.
        const age = time;
        const flicker = age < 1.6 ? (Math.sin(age * 50) > 0 ? 1 : 0.25) * Math.min(age / 0.5, 1) : 1;
        u.uBoost.value += (flicker - u.uBoost.value) * 0.25;
        break;
      }

      case 'table': {
        // Hologram breathing, 2.3 <-> 2.9 at 0.4 Hz.
        const breathe = 2.6 + Math.sin(time * 0.4 * Math.PI * 2) * 0.3;
        u.uStrength.value += (breathe - u.uStrength.value) * 0.1;
        break;
      }

      case 'stage': {
        // It *is* a turntable: 0.15 rad/s, plus a canopy breath on the emissive.
        spin.current += dt * 0.15;
        if (i) i.rotation.y = spin.current;
        u.uStrength.value = 0.5 + Math.sin(time * 0.55) * 0.09;
        break;
      }

      case 'booth': {
        // Panels flash to 1.0 for 250 ms as the camera crosses the booth plane at
        // z = -128. Keyed to the FLY-THROUGH beat and retimed with it.
        const cross = THREE.MathUtils.clamp(1 - Math.abs(t - 0.545) / 0.018, 0, 1);
        boothFlash.current += (cross - boothFlash.current) * 0.2;
        u.uStrength.value = 0.55 + boothFlash.current * 1.35;
        break;
      }

      case 'machine': {
        // Hub -> panels: uSeq walks the local-X gradient so the row finishes igniting
        // exactly as the camera reaches the chapter-3 hold. The span is the distance from
        // the 'emerge' beat to that hold, so it retimes with the table rather than with a
        // number that used to be right.
        const local = THREE.MathUtils.clamp((t - 0.57) / 0.065, 0, 1);
        const eased = local * local * (3 - 2 * local);
        u.uSeq.value += (eased * 1.12 - u.uSeq.value) * 0.12;
        u.uStrength.value = 0.9 + Math.sin(time * 3.1) * 0.05;
        break;
      }

      case 'array': {
        // Y-spin reads as a radar sweep because the dish is tilted; scroll accelerates it.
        const boost = 1 + scroll.speed * 5.5;
        spin.current += dt * 0.08 * boost;
        if (i) {
          i.rotation.y = spin.current;
          i.rotation.z = Math.sin(time * 0.31) * 0.035;
        }
        // Bead twinkle.
        u.uStrength.value = 0.6 + Math.sin(time * 2.3) * 0.05 + Math.sin(time * 5.7) * 0.03;
        break;
      }
    }
  });

  return (
    <group ref={group} position={def.position} rotation={[0, def.rotationY, 0]} visible={false}>
      <group ref={inner}>
        <primitive object={scene} scale={def.scale} />
      </group>
    </group>
  );
}

export function preloadStations(urls: string[]) {
  urls.forEach((u) => useGLTF.preload(u));
}
