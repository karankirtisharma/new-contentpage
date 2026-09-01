import type { Tier } from './store';

export type FogQuality = 'basic' | 'cards' | 'cards+march';

export type TierConfig = {
  tier: Tier;
  dpr: [number, number];
  /** Base dust mote count; layers take fractions of it (Atmosphere.tsx). */
  dust: number;
  /** Near-ground debris motes, station-local (master doc 3I). */
  debris: number;
  bloom: boolean;
  /** Mip levels for the bloom's blur pyramid. Wider = softer, larger halo. */
  bloomLevels: number;
  chromaticAberration: boolean;
  noise: boolean;
  smaa: boolean;
  monitors: number;

  // --- overhaul systems -------------------------------------------------------
  /** Corridor terrain grid segments [acrossPath (X), alongPath (Z)]. */
  terrain: [number, number];
  /** Instanced rock count scattered along the corridor. */
  rocks: number;
  /** Rock icosahedron detail levels used for the variant set. */
  rockDetail: number[];
  /** World-XZ detail normal on terrain / triplanar on rocks. */
  detailNormal: 'triplanar' | 'planar' | 'off';
  /** Distant ridge layers: ring + optional flanks. */
  ridgeFlanks: boolean;
  /** Fog layering: material chunk always on; this gates cards and the raymarch pass. */
  fogQuality: FogQuality;
  /** Fog card count placed at zone boundaries. */
  fogCards: number;
  /** Soft-particle depth read on fog cards (needs the depth texture). */
  fogSoftParticles: boolean;
  /** Star count across both shells; 0 disables the field. */
  stars: number;
  /** Two parallax shells vs one. */
  starShells: 1 | 2;
  /** Shadow map size for the single moon directional; 0 = no shadows. */
  shadowMap: number;
  /** Practical PointLight pool size (FIXED at boot — Trap #14). */
  practicals: number;
  /** N8AO quality; 'off' skips the pass entirely. */
  ao: 'medium' | 'performance' | 'off';
  /** N8AO half-resolution mode. */
  aoHalfRes: boolean;
  /** Depth of field at flagged beats. */
  dof: boolean;
  /** Idle heartbeat while parked, in Hz (demand frameloop — master doc 2F). */
  heartbeatHz: number;
};

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  desktop: {
    tier: 'desktop',
    dpr: [1, 1.5],
    dust: 2000,
    debris: 40,
    bloom: true,
    bloomLevels: 7,
    chromaticAberration: true,
    noise: true,
    smaa: true,
    monitors: 3,
    terrain: [112, 224],
    rocks: 300,
    rockDetail: [1, 2, 2, 3],
    detailNormal: 'triplanar',
    ridgeFlanks: true,
    fogQuality: 'cards+march',
    fogCards: 14,
    fogSoftParticles: true,
    stars: 1400,
    starShells: 2,
    shadowMap: 2048,
    practicals: 5,
    ao: 'medium',
    aoHalfRes: false,
    dof: true,
    heartbeatHz: 12,
  },
  laptop: {
    tier: 'laptop',
    dpr: [1, 1.25],
    dust: 1200,
    debris: 24,
    bloom: true,
    bloomLevels: 6,
    chromaticAberration: true,
    noise: false,
    smaa: true,
    monitors: 3,
    terrain: [96, 192],
    rocks: 100,
    rockDetail: [2],
    detailNormal: 'planar',
    ridgeFlanks: false,
    fogQuality: 'cards',
    fogCards: 10,
    fogSoftParticles: false,
    stars: 1000,
    starShells: 2,
    shadowMap: 1024,
    practicals: 4,
    ao: 'performance',
    aoHalfRes: true,
    dof: true,
    heartbeatHz: 12,
  },
  mobile: {
    tier: 'mobile',
    dpr: [1, 1],
    dust: 600,
    debris: 0,
    bloom: true,
    bloomLevels: 5,
    chromaticAberration: false,
    noise: false,
    smaa: false,
    monitors: 1,
    terrain: [64, 128],
    rocks: 60,
    rockDetail: [2],
    detailNormal: 'off',
    ridgeFlanks: false,
    fogQuality: 'cards',
    fogCards: 6,
    fogSoftParticles: false,
    stars: 800,
    starShells: 1,
    shadowMap: 0,
    practicals: 3,
    ao: 'off',
    aoHalfRes: true,
    dof: false,
    heartbeatHz: 8,
  },
  fallback: {
    tier: 'fallback',
    dpr: [1, 1],
    dust: 0,
    debris: 0,
    bloom: false,
    bloomLevels: 0,
    chromaticAberration: false,
    noise: false,
    smaa: false,
    monitors: 0,
    terrain: [48, 96],
    rocks: 20,
    rockDetail: [2],
    detailNormal: 'off',
    ridgeFlanks: false,
    fogQuality: 'basic',
    fogCards: 0,
    fogSoftParticles: false,
    stars: 0,
    starShells: 1,
    shadowMap: 0,
    practicals: 2,
    ao: 'off',
    aoHalfRes: true,
    dof: false,
    heartbeatHz: 8,
  },
};

/** Probe once at boot. Never called during render. */
export function detectTier(): Tier {
  if (typeof window === 'undefined') return 'desktop';

  const forced = new URLSearchParams(window.location.search).get('tier');
  if (forced && forced in TIER_CONFIG) return forced as Tier;

  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  } catch {
    gl = null;
  }
  if (!gl) return 'fallback';

  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const width = window.innerWidth;

  if (mem !== undefined && mem < 2) return 'fallback';

  // Width first, touch second. A touchscreen laptop or a Surface reports a coarse
  // pointer but has a discrete GPU and a 1080p+ viewport — treating every coarse
  // pointer as a phone drops those machines to 600 dust motes and one video monitor
  // for no reason. Coarse only decides the case in the ambiguous tablet band.
  if (width < 900) return 'mobile';
  if (coarse && width < 1200) return 'mobile';
  if ((mem !== undefined && mem < 4) || cores <= 4) return 'laptop';

  // Software renderers (SwiftShader / llvmpipe) cannot carry bloom at this triangle count.
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase();
    if (/swiftshader|llvmpipe|software|basic render/.test(renderer)) return 'fallback';
    if (/intel.*(hd|uhd) graphics/.test(renderer)) return 'laptop';
  }

  return 'desktop';
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
