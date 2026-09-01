import { createNoise2D } from 'simplex-noise';

/**
 * The lunar surface height field — master doc 2B, adapted to the owner's reference:
 * WE ARE ON THE MOON. This is the land, and it is the hero of the frame, so it carries a
 * real crater field rather than generic rolling hills.
 *
 * Everything here is CPU-ONLY and evaluated ONCE at load. The GPU never re-evaluates
 * terrain noise: the terrain shader does slope/height shading plus a tiled detail normal,
 * and the fog uses its own noise texture. That means there is no JS-vs-GLSL noise-matching
 * problem, and one `height()` function can ground the mesh, the station pads, the boulder
 * scatter and the camera path — they agree by construction instead of by luck.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x10a12;
const rand = mulberry32(SEED);
const noise2D = createNoise2D(rand);

/** Fractal Brownian motion — the broad undulation of the mare floor. */
function fbm(x: number, z: number, octaves: number, freq: number, gain = 0.5): number {
  let amp = 1;
  let f = freq;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * f, z * f);
    norm += amp;
    amp *= gain;
    f *= 2.03; // slightly off 2.0 so octaves never phase-lock into visible grids
  }
  return sum / norm;
}

/**
 * Ridged noise: `(1 - |n|)^2`. Where the underlying noise crosses zero you get a sharp
 * crease, which is what gives the horizon the jagged massifs in the reference frame
 * instead of soft dunes.
 */
function ridged(x: number, z: number, octaves: number, freq: number): number {
  let amp = 1;
  let f = freq;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2D(x * f, z * f));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.11;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- craters

export type Crater = { x: number; z: number; r: number; depth: number; rim: number };

/**
 * A scattered impact field across the corridor. Radii follow a power law (many small,
 * few large) like the real size-frequency distribution.
 *
 * The scatter is matched to the terrain sheet (+-90 x, and the full travelled z range).
 * It used to spread over +-150 in x, which put more than half the field on ground that
 * does not exist and left the visible corridor nearly uncratered. Only the genuinely
 * large basins are held off the centreline now: the corridor grading keeps the rest
 * shallow, and `groundCamera` guarantees the dolly clears whatever is left.
 */
function buildCraters(): Crater[] {
  const r = mulberry32(0xc2a7e5);
  const out: Crater[] = [];
  const COUNT = 420;
  for (let i = 0; i < COUNT; i++) {
    const u = r();
    const rad = 3.6 + 30 * Math.pow(u, 2.8);
    const x = (r() - 0.5) * 180;
    const z = 45 - r() * 320;
    // Only the basins big enough to swallow a station stay off the travelled centreline.
    if (Math.abs(x) < rad * 0.6 + 4 && rad > 16) continue;
    out.push({
      x,
      z,
      r: rad,
      depth: rad * (0.22 + r() * 0.16),
      rim: rad * (0.08 + r() * 0.07),
    });
  }
  return out;
}

export const CRATERS: Crater[] = buildCraters();

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Squared distance from (px,pz) to segment (ax,az)-(bx,bz). */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, (wx * vx + wz * vz) / len2)) : 0;
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return Math.hypot(dx, dz);
}

export type Pad = { x: number; z: number; y: number; rInner: number; rOuter: number };

export type TerrainConfig = {
  /** Flattened station pads, blended into the noise. */
  pads: Pad[];
  /** Camera corridor polyline; displacement is damped near it so the lens never clips. */
  corridor: [number, number][];
};

/**
 * Raw geology at (x, z) — before pads and the corridor damp. Exported so the ridge mesh
 * can share the same character without inheriting the corridor's flattening.
 */
export function baseHeight(x: number, z: number): number {
  // Every term below is already in world units — no trailing mix weights. The first pass
  // had amplitudes multiplied by 0.48/0.34/0.18 on top of each other, and the whole
  // 170x330 sheet ended up spanning fifteen units: a pool table with a tilt.
  //
  // Broad mare undulation — the slow swell the landscape sits on.
  const base = fbm(x, z, 4, 1 / 46) * 4.5;

  // Jagged massifs, ramped up hard away from the corridor: two ridged bands rather than
  // one, because a single band at a single wavelength gives smooth dunes. The long band
  // builds the horizon; the tight one keeps the ground broken close to the lens.
  const flank = smoothstep(8, 52, Math.abs(x));
  const massif = ridged(x + 512, z - 128, 4, 1 / 74) * (1.6 + flank * 26);
  const broken = ridged(x - 233, z + 411, 3, 1 / 19) * (1.4 + flank * 5);

  // Fine break-up that still moves vertices (wavelength stays above ~6u; anything
  // finer belongs in the detail normal, not in geometry).
  const detail = fbm(x + 91, z + 37, 2, 1 / 8.5) * 1.5;

  return base + massif + broken + detail;
}

/**
 * Just the broad swell — the elevation the landscape would have with every sharp feature
 * removed. The corridor is graded onto THIS rather than toward y = 0: scaling height by a
 * factor pulls the travelled strip down to a flat ribbon that reads as a runway cut
 * through the moon, which is precisely what it looked like.
 */
export function broadHeight(x: number, z: number): number {
  return fbm(x, z, 4, 1 / 46) * 4.5;
}

/**
 * Crater contribution at (x, z): bowl inside, raised rim at the edge, ejecta outside.
 *
 * Deepest-bowl / highest-rim rather than a sum. Summing looks reasonable until the field
 * gets dense enough to matter: 220 overlapping craters stacked into 20-unit walls that
 * buried the camera. It is also the more honest geology — a later impact resets the
 * floor it lands on, it does not excavate twice as deep.
 */
export function craterHeight(x: number, z: number): number {
  let bowl = 0;
  let rim = 0;
  for (let i = 0; i < CRATERS.length; i++) {
    const c = CRATERS[i];
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > c.r * 2.1) continue;
    const q = d / c.r;
    if (q < 1) {
      const b = -c.depth * (1 - q * q);
      if (b < bowl) bowl = b;
      const r = c.rim * smoothstep(0.74, 1.0, q);
      if (r > rim) rim = r;
    } else {
      const r = c.rim * (1 - smoothstep(1.0, 2.1, q));
      if (r > rim) rim = r;
    }
  }
  return bowl + rim;
}

/**
 * The height function every consumer uses. Applies, in order: geology, craters, the
 * corridor grading, then the station pads.
 *
 * THE ORDER MATTERS AND THIS IS WHY. The pads must be applied LAST, because a pad is an
 * assertion — "the ground here is exactly p.y, because that is where the machine's feet
 * are". Running the corridor grading afterwards drags the flattened shelf back toward the
 * broad swell and every station floats about a unit above its own pad, which is precisely
 * what the first version did to all six.
 */
export function makeHeightFn(cfg: TerrainConfig) {
  const { pads, corridor } = cfg;

  return function height(x: number, z: number): number {
    let h = baseHeight(x, z) + craterHeight(x, z);

    // --- corridor grading: toward the broad swell, not toward zero, so the travelled
    //     line keeps the elevation the landscape already has and only loses amplitude.
    let dMin = Infinity;
    for (let i = 0; i < corridor.length - 1; i++) {
      const a = corridor[i];
      const b = corridor[i + 1];
      const d = distToSegment(x, z, a[0], a[1], b[0], b[1]);
      if (d < dMin) dMin = d;
    }
    if (dMin < 26) {
      const k = smoothstep(5, 26, dMin);
      const broad = broadHeight(x, z);
      h = broad + (h - broad) * (0.55 + 0.45 * k);
    }

    // --- station pads: flatten to the pad's own y, blended out over rInner..rOuter
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.rOuter) continue;
      const k = smoothstep(p.rInner, p.rOuter, d);
      h = p.y + (h - p.y) * k;
    }

    return h;
  };
}

/** Analytic-ish normal by central differences on the final height function. */
export function heightNormal(
  height: (x: number, z: number) => number,
  x: number,
  z: number,
  eps = 0.6,
): [number, number, number] {
  const hx = height(x + eps, z) - height(x - eps, z);
  const hz = height(x, z + eps) - height(x, z - eps);
  const nx = -hx;
  const ny = 2 * eps;
  const nz = -hz;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export { mulberry32, fbm, ridged, distToSegment, smoothstep };
