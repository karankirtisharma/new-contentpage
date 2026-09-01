'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MOON_DIR, PALETTE, STATIONS } from '@/lib/world';
import { PAD_LIST } from '@/lib/terrain';
import { scroll, chapterFromT } from '@/lib/store';
import type { TierConfig } from '@/lib/tier';

/**
 * The lighting rig — master doc 3E.
 *
 * Three layers, and the discipline that makes the art direction work is that GREEN ONLY
 * EVER COMES FROM A SOURCE. Nothing here tints the scene:
 *
 *   1. MOON KEY — one directional along MOON_DIR, desaturated pale green. It shapes the
 *      whole landscape and is the only shadow caster. Saturation is deliberately held
 *      back so the emerald reads as belonging to the machines, not to the air.
 *   2. PRACTICALS — a FIXED pool of point lights that are teleported between stations
 *      and crossfaded by intensity. Never mounted/unmounted, never `.visible` toggled
 *      (Trap #14: three keys shader programs on the light COUNT, so adding or hiding one
 *      recompiles every material in the scene and hitches mid-scroll).
 *   3. AMBIENT — a PMREM of a purpose-built proxy sky, not `RoomEnvironment`. The stock
 *      room is a white photographic studio; against near-black regolith it lifted the
 *      whole surface about 5x and turned the moon into sand. This one is a black dome
 *      with a moon disc and an emerald horizon strip, so what little ambient exists
 *      arrives from the right directions with the right colour.
 */

const LIGHTSTYLE = {
  // Quake/Valve lightstyle strings, sampled at 10 Hz. 'a' = off, 'm' = normal, 'z' = 2x.
  candle: 'mmmmmaaaaammmmmaaaaaabcdefgabcdefg',
  flicker: 'mmnmmommommnonmmonqnmmo',
  steady: 'mmmmmmmmmmnmmmmmmmmmlmmmmmmmm',
};

function sampleStyle(style: string, t: number) {
  const f = t * 10;
  const i = Math.floor(f);
  const frac = f - i;
  const a = (style.charCodeAt(i % style.length) - 97) / 12.5;
  const b = (style.charCodeAt((i + 1) % style.length) - 97) / 12.5;
  return a + (b - a) * frac;
}

/**
 * A dark proxy sky, PMREM'd once. This is the scene's entire ambient term — there is no
 * AmbientLight, because a uniform ambient flattens exactly the shadow detail this
 * palette is built on.
 */
function MoonEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const proxy = new THREE.Scene();

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(60, 24, 16),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#010503'), side: THREE.BackSide }),
    );
    proxy.add(dome);

    // Horizon strip: the emerald that metals pick up as a rim.
    const horizon = new THREE.Mesh(
      new THREE.CylinderGeometry(52, 52, 7, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#0b2a1c'),
        side: THREE.BackSide,
      }),
    );
    horizon.position.y = 1.5;
    proxy.add(horizon);

    // The moon disc, aligned with MOON_DIR so specular highlights and the analytic key
    // agree about where the light is.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(11, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfeeda') }),
    );
    disc.position.set(MOON_DIR[0] * 48, MOON_DIR[1] * 48, MOON_DIR[2] * 48);
    disc.lookAt(0, 0, 0);
    proxy.add(disc);

    // Two very dim side rims so edges never go completely dead.
    [-1, 1].forEach((s) => {
      const rim = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a2418') }),
      );
      rim.position.set(s * 50, 6, -10);
      rim.lookAt(0, 4, -10);
      proxy.add(rim);
    });

    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(proxy, 0.02);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.07;

    proxy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    pmrem.dispose();

    return () => {
      scene.environment = null;
      env.texture.dispose();
    };
  }, [gl, scene]);

  return null;
}

export default function Lighting({ config }: { config: TierConfig }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const keyTarget = useRef<THREE.Object3D>(null);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  // Fixed practical pool — allocated once, at the tier's size, and never resized.
  const practicals = useRef<(THREE.PointLight | null)[]>([]);
  const poolSize = config.practicals;

  useEffect(() => {
    const k = key.current;
    const t = keyTarget.current;
    if (!k || !t) return;
    k.target = t;
    scene.add(t);

    if (config.shadowMap > 0) {
      k.castShadow = true;
      k.shadow.mapSize.set(config.shadowMap, config.shadowMap);
      // MOON_DIR sits at 17 degrees of elevation, so a shadow runs about 3.2x the
      // height of whatever casts it: a 4u machine throws 13u, a boulder throws 8u. At the
      // +-13 the box started at, every one of those shadows was sliced off mid-length
      // against the ortho frustum and the cut showed as a hard-edged dark rectangle
      // sliding across the regolith with the camera. Size the box for the shadow, not
      // for the caster.
      const cam = k.shadow.camera as THREE.OrthographicCamera;
      cam.left = -32;
      cam.right = 32;
      cam.top = 32;
      cam.bottom = -32;
      cam.near = 1;
      cam.far = 130;
      k.shadow.bias = -0.0006;
      k.shadow.normalBias = 0.035;
      cam.updateProjectionMatrix();
      // Shadows only need redrawing when the world moves under them, i.e. on scroll.
      // Parked, they are free.
      gl.shadowMap.autoUpdate = false;
      gl.shadowMap.needsUpdate = true;
    }
    return () => {
      scene.remove(t);
    };
  }, [scene, gl, config.shadowMap]);

  const lastShadowT = useRef(-1);

  const emitters = useMemo(
    () => PAD_LIST.map((p) => new THREE.Vector3(p.x, p.y + 1.4, p.z)),
    [],
  );

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const look = scroll.look;

    // --- key follows the shot, with texel snapping so shadows do not swim
    if (key.current && keyTarget.current) {
      keyTarget.current.position.set(look.x, look.y, look.z);
      const texel = 64 / Math.max(config.shadowMap, 1);
      const snap = (v: number) => (config.shadowMap > 0 ? Math.round(v / texel) * texel : v);
      key.current.position.set(
        snap(look.x + MOON_DIR[0] * 62),
        snap(look.y + MOON_DIR[1] * 62),
        snap(look.z + MOON_DIR[2] * 62),
      );
    }

    if (config.shadowMap > 0 && Math.abs(scroll.t - lastShadowT.current) > 1e-4) {
      gl.shadowMap.needsUpdate = true;
      lastShadowT.current = scroll.t;
    }

    // --- practicals: park one on each station near the current chapter, crossfade the
    //     rest to zero. Positions are teleported; the pool size never changes.
    const chapter = chapterFromT(scroll.t);
    for (let i = 0; i < practicals.current.length; i++) {
      const light = practicals.current[i];
      if (!light) continue;
      const station = STATIONS[i];
      if (!station) {
        light.intensity = 0;
        continue;
      }
      const near = Math.abs(station.chapter - chapter) <= 1;
      const style = i === 0 ? LIGHTSTYLE.candle : i % 2 ? LIGHTSTYLE.flicker : LIGHTSTYLE.steady;
      // Breathing drives the light and (in Phase 7) the fixture emissive from the SAME
      // value — that is what sells the light as belonging to the machine.
      const breath = 0.9 + 0.14 * (sampleStyle(style, time + i * 3.1) - 1);
      const target = near ? 9 * breath : 0;
      light.intensity += (target - light.intensity) * 0.06;
      const e = emitters[i];
      if (e) light.position.set(e.x, e.y, e.z);
    }
  });

  return (
    <>
      <MoonEnvironment />
      <object3D ref={keyTarget} />
      <directionalLight
        ref={key}
        intensity={2.6}
        color={PALETTE.moonLight}
        position={[MOON_DIR[0] * 42, MOON_DIR[1] * 42, MOON_DIR[2] * 42]}
      />
      {Array.from({ length: poolSize }).map((_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            practicals.current[i] = el;
          }}
          intensity={0}
          distance={14}
          decay={2}
          castShadow={false}
          color={i === 0 ? PALETTE.practicalHero : PALETTE.practical}
        />
      ))}
    </>
  );
}
