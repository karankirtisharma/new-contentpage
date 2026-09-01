'use client';

import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { FLOOR, PALETTE, STATIONS } from '@/lib/world';
import { scroll, useSignal } from '@/lib/store';
import type { TierConfig } from '@/lib/tier';
import { TIER_CONFIG } from '@/lib/tier';
import CameraRig from './CameraRig';
import Station from './Station';
import SignalNetwork from './SignalNetwork';
import Terrain from './Terrain';
import Rocks from './Rocks';
import Ridge from './Ridge';
import Atmosphere from './Atmosphere';
import Fog from './Fog';
import StageMonitors from './StageMonitors';
import Post from './Post';
import Debug from './Debug';
import Lighting from './Lighting';
import Sky from './Sky';

/**
 * `scene.fog` stays NULL for the rest of this project's life.
 *
 * THREE.FogExp2 is gone: one global density cannot serve a corridor that has to be clear
 * at the establish vista, opaque in the banks and clear again for the finale reveal — the
 * old build was already fighting that with a 72% crane lift. The replacement is the
 * layered atmosphere in Phase 4: an analytic height+distance fog chunk patched into every
 * lit material, driven by the authored per-zone sigma table in world.ts.
 *
 * Leaving scene.fog null also means USE_FOG is never defined, so three's stock fog chunks
 * compile to nothing and there is zero risk of double-fogging once the custom chunk lands.
 */
function SceneBackdrop() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = null;
    // The dome owns the backdrop; this flat colour is only the backstop behind it.
    scene.background = new THREE.Color(PALETTE.black);
  }, [scene]);
  return null;
}

/**
 * Readiness is deterministic, not manager-derived.
 *
 * This component sits inside the SAME Suspense boundary as the hero rig, so React
 * only mounts it once that GLB has actually resolved and its materials are built.
 * drei's useProgress feeds the loader's byte readout, but the gate that opens the
 * page is this mount — a stalled or silent loading manager can never strand the user
 * on the loader.
 */
function ReadySignal() {
  const setLoaded = useSignal((s) => s.setLoaded);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    // Compile the hero's shaders before lifting the iris, so the reveal never hitches.
    try {
      gl.compile(scene, camera);
    } catch {
      /* compile is best-effort */
    }
    const id = setTimeout(() => setLoaded(true), 220);
    return () => clearTimeout(id);
  }, [setLoaded, gl, scene, camera]);

  return null;
}

/**
 * Lighting now lives in its own module (`Lighting.tsx`). What was here — a 140-intensity
 * spot plus two point lights and three.js's white-studio RoomEnvironment — was tuned
 * against a floor shader that ignored scene lights entirely. On real lit regolith it
 * over-lit the surface by roughly 5x and turned the moon into a beach. See the note at
 * the top of Lighting.tsx.
 */

/**
 * Adaptive resolution.
 *
 * `PerformanceMonitor` rather than drei's `AdaptiveDpr`: AdaptiveDpr resizes the drawing
 * buffer from inside the render loop, which N8AO's own resize handling fights
 * (react-postprocessing #280) — the two take turns reallocating render targets and the
 * frame rate collapses in exactly the situation the feature exists to rescue. DPR is
 * still the lever, it is simply moved out of the loop; and requiring a run of flip-flops
 * means the machine is genuinely at its limit rather than momentarily busy.
 */
/**
 * The idle heartbeat.
 *
 * `frameloop="demand"` renders only when something asks, which is right for a page that
 * spends most of its time parked — but this scene is supposed to be ALIVE while parked:
 * the practicals breathe on their lightstyle strings, the seam pulses, the dust drifts,
 * the hold orbit turns, and at t = 1.0 the copy explicitly promises "the system idles
 * alive". Twelve frames a second of a scene that renders in a dozen milliseconds costs
 * almost nothing and keeps that promise; true zero only happens when the tab is hidden,
 * where there is nobody to keep the promise to.
 */
function Heartbeat({ hz }: { hz: number }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(invalidate, 1000 / hz);
    };
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    // Publish the waker for the DOM side (ScrollDriver's scroll and pointer handlers).
    scroll.invalidate = invalidate;
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      scroll.invalidate = null;
    };
  }, [invalidate, hz]);

  return null;
}

function AdaptiveQuality({ config }: { config: TierConfig }) {
  const setDpr = useThree((s) => s.setDpr);
  const current = useRef(config.dpr[1]);
  return (
    <PerformanceMonitor
      bounds={() => [45, 58]}
      flipflops={3}
      onChange={({ factor }) => {
        const [lo, hi] = config.dpr;
        const next = lo + (hi - lo) * factor;
        if (Math.abs(next - current.current) > 0.05) {
          current.current = next;
          setDpr(next);
        }
      }}
    />
  );
}

function World() {
  // Shared with SignalNetwork: the buried seam is shaded by the terrain's own material.
  const terrainMat = useRef<THREE.MeshStandardMaterial | null>(null);
  const tier = useSignal((s) => s.tier);
  const debug = useSignal((s) => s.debug);
  const config = TIER_CONFIG[tier];
  const orbit =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('orbit') === '1';

  return (
    <>
      {debug && <Debug orbit={orbit} />}
      <SceneBackdrop />
      <Sky config={config} />
      <CameraRig handOff={debug && orbit} />
      <Lighting config={config} />

      {/* THE LUNAR SURFACE — the land, and the hero of every wide shot. */}
      <Terrain config={config} materialRef={terrainMat} />
      <Rocks config={config} />
      <Ridge config={config} />
      <Fog config={config} />
      <SignalNetwork config={config} terrain={terrainMat} />
      <Atmosphere config={config} />

      {/* Hero rig gates the loader; every other station streams in behind it. */}
      <Suspense fallback={null}>
        <Station def={STATIONS[0]} />
        <ReadySignal />
      </Suspense>
      {STATIONS.slice(1).map((def) => (
        <Suspense key={def.id} fallback={null}>
          <Station def={def} />
        </Suspense>
      ))}

      {config.monitors > 0 && <StageMonitors count={config.monitors} />}

      <Post config={config} />
    </>
  );
}

export default function Scene() {
  const tier = useSignal((s) => s.tier);
  const config = TIER_CONFIG[tier];

  if (tier === 'fallback') return null;

  return (
    <Canvas
      className="signal-canvas"
      aria-hidden
      frameloop="demand"
      dpr={config.dpr}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      camera={{ fov: 42, near: 0.35, far: 420, position: [0.1, 0.95, 5.4] }}
      onCreated={(state) => {
        const { gl, scene } = state;
        // THE PIPELINE INVERSION (Trap #15). The renderer tone-maps nothing; the composer
        // owns it, at the end, in AgX. Clamping to [0,1] here would destroy the HDR range
        // the bloom threshold of 1.0 depends on, and there would be no way to tell a hot
        // emissive from a lit wall by the time bloom ran.
        //
        // The fallback tier has no composer, so it tone-maps here instead — same
        // transform, different place, which is why this is conditional and not a constant.
        gl.toneMapping = config.bloom ? THREE.NoToneMapping : THREE.AgXToneMapping;
        gl.toneMappingExposure = 1;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        scene.background = new THREE.Color(PALETTE.black);
        if (process.env.NODE_ENV !== 'production') {
          (window as unknown as { __signal?: unknown }).__signal = state;
        }
      }}
    >
      <AdaptiveQuality config={config} />
      <Heartbeat hz={config.heartbeatHz} />
      <Suspense fallback={null}>
        <World />
      </Suspense>
    </Canvas>
  );
}

// Named so the floor centre stays in sync if §4 changes.
export const FLOOR_CENTER = FLOOR.center;
