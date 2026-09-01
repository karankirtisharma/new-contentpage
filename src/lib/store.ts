'use client';

import { create } from 'zustand';

export type Tier = 'desktop' | 'laptop' | 'mobile' | 'fallback';

type SignalState = {
  /** Raw normalised scroll progress written by ScrollTrigger. Never read per-frame from React. */
  t: number;
  /** Smoothed scroll velocity, |dt| per frame. */
  velocity: number;
  /** Active chapter index 0..5, derived from t. */
  chapter: number;
  tier: Tier;
  reducedMotion: boolean;
  loaded: boolean;
  entered: boolean;
  drawer: number | null;
  lightbox: number | null;
  debug: boolean;

  setChapter: (c: number) => void;
  setTier: (t: Tier) => void;
  setReducedMotion: (v: boolean) => void;
  setLoaded: (v: boolean) => void;
  setEntered: (v: boolean) => void;
  setDrawer: (i: number | null) => void;
  setLightbox: (i: number | null) => void;
  setDebug: (v: boolean) => void;
};

export const useSignal = create<SignalState>((set) => ({
  t: 0,
  velocity: 0,
  chapter: 0,
  tier: 'desktop',
  reducedMotion: false,
  loaded: false,
  entered: false,
  drawer: null,
  lightbox: null,
  debug: false,

  setChapter: (chapter) => set({ chapter }),
  setTier: (tier) => set({ tier }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setLoaded: (loaded) => set({ loaded }),
  setEntered: (entered) => set({ entered }),
  setDrawer: (drawer) => set({ drawer }),
  setLightbox: (lightbox) => set({ lightbox }),
  setDebug: (debug) => set({ debug }),
}));

/**
 * Per-frame channel. Deliberately OUTSIDE React state — the scroll driver writes it
 * every tick and `useFrame` consumers read it. Nothing here ever triggers a render.
 */
export const scroll = {
  /** Raw target from ScrollTrigger. */
  target: 0,
  /** Critically damped follower actually used by the camera. */
  t: 0,
  /** Signed per-frame delta of `t`. */
  velocity: 0,
  /** Smoothed absolute velocity, 0..~1, used for fog / CA / spin acceleration. */
  speed: 0,
  /** Pointer in NDC, for parallax. */
  pointer: { x: 0, y: 0 },
  /** Lerped pointer. */
  parallax: { x: 0, y: 0 },
  /** The camera's current look target, published for the travelling light rig. */
  look: { x: 0, y: 0.6, z: 0 },

  /**
   * Wakes the canvas. Set by the scene once it mounts; called by the DOM-side scroll and
   * pointer handlers, which live outside the Canvas and so cannot reach `useThree`.
   * Null before the scene exists and on the fallback tier, where there is no canvas.
   */
  invalidate: null as null | (() => void),

  // --- environment timeline (written by CameraRig, read by fog/post/lights) ---
  /**
   * Fog extinction density for the camera's current position, from the zone table
   * blended with the per-beat multiplier. σ / height-falloff model — NEVER near/far;
   * the two parameterisations are not interchangeable (master doc 2G #7).
   */
  fogSigma: 0.02,
  /** Height falloff `b` in `density(y) = a·e^(−b·y)`. */
  fogHeight: 0.09,
  /** Pre-tone-map exposure multiplier (the composer runs NoToneMapping until Phase 8). */
  exposure: 1,
  /** Depth-of-field focus distance in world units; <= 0 means DoF off at this beat. */
  dof: 0,
  /** Signal pulse position along the path polyline, 0..1. */
  pulseT: 0,
  /** Camera roll in radians, damped; applied after lookAt. */
  roll: 0,
};

export const CHAPTER_RANGES: [number, number][] = [
  [0.0, 0.12],
  [0.12, 0.3],
  [0.3, 0.55],
  [0.55, 0.72],
  [0.72, 0.88],
  [0.88, 1.0],
];

export function chapterFromT(t: number) {
  for (let i = CHAPTER_RANGES.length - 1; i >= 0; i--) {
    if (t >= CHAPTER_RANGES[i][0]) return i;
  }
  return 0;
}
