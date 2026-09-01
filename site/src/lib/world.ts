/**
 * World layout — §4 of content-page-3d-plan.md.
 * Scene units are metres. Every Tripo model ships as a ~1-unit bbox with its base at y=0,
 * so `scale` below is what makes each station read at hero size from ~3.5 units away.
 */

export type StationId = 'rig' | 'table' | 'stage' | 'booth' | 'machine' | 'array';

export type Station = {
  id: StationId;
  url: string;
  /** Chapter this station belongs to; drives the visibility window. */
  chapter: number;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  /** §6 calibrated emissive strength. */
  emissive: number;
  /** Where the Signal conduit plugs into this station. */
  port: [number, number, number];
  /** Chapters either side of `chapter` where the station stays in the graph. */
  window: number;
};

const DEG = Math.PI / 180;

export const STATIONS: Station[] = [
  {
    id: 'rig',
    url: '/models/camera_rig_web.glb',
    chapter: 0,
    position: [3, 0, -20],
    // The lens sits at the +X end of the rig's long axis. -31 deg angles it back at
    // the viewer while keeping the bellows frames and slates in a readable 3/4 —
    // dead-on (-90) foreshortens the whole rig into a disc.
    rotationY: -31 * DEG,
    scale: 3.0,
    emissive: 1.3,
    port: [2.1, 0.05, -20.4],
    window: 1,
  },
  {
    id: 'table',
    url: '/models/sci-fi_control_table_web.glb',
    chapter: 1,
    position: [-9, 0, -60],
    rotationY: 52 * DEG,
    scale: 3.2,
    emissive: 2.6,
    port: [-8.2, 0.05, -59.0],
    window: 1,
  },
  {
    id: 'stage',
    url: '/models/futuristic_control_ring_web.glb',
    chapter: 2,
    position: [8, 0, -100],
    rotationY: -24 * DEG,
    scale: 3.4,
    emissive: 0.5,
    port: [7.0, 0.05, -98.6],
    window: 1,
  },
  {
    id: 'booth',
    url: '/models/green_technical_device_web.glb',
    chapter: 2,
    position: [0, 0, -128],
    rotationY: 0,
    scale: 3.6,
    emissive: 0.55,
    port: [-0.8, 0.05, -127.4],
    window: 1,
  },
  {
    id: 'machine',
    url: '/models/futuristic_machinery_web.glb',
    chapter: 3,
    position: [-9, 0, -168],
    rotationY: 28 * DEG,
    scale: 3.2,
    emissive: 0.9,
    port: [-8.0, 0.05, -166.8],
    window: 1,
  },
  {
    id: 'array',
    url: '/models/sci-fi_prop_web.glb',
    chapter: 4,
    position: [8, 0, -208],
    rotationY: -34 * DEG,
    scale: 3.0,
    emissive: 0.6,
    port: [7.0, 0.05, -206.5],
    window: 1,
  },
];

export const STATION_BY_ID = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
) as Record<StationId, Station>;

/**
 * THE SIGNAL PATH — master doc 3G.
 *
 * The polyline the buried seam, the node pucks and the pulse all share. It runs THROUGH
 * the six machines rather than past them, with a lead-in before the first and a run-out
 * past the last, so the network reads as something that was already here and the
 * machines were built onto — not as a cable someone laid between them.
 *
 * Flat (x, z) pairs: it is consumed by the terrain's fragment shader as `vec2[8]`, and
 * the height comes from the terrain itself at every point, because the seam is buried.
 */
export const SIGNAL_PATH: [number, number][] = [
  [0, 22],
  [3, -20],
  [-9, -60],
  [8, -100],
  [0, -128],
  [-9, -168],
  [8, -208],
  [2, -244],
];


/**
 * Station pads — master doc 3A. Each machine stands on a flattened shelf blended into
 * the regolith, so nothing floats and nothing is half-buried. `y` is the shelf height;
 * `Terrain` writes it back into `STATIONS[i].position[1]` at build time so the models,
 * the pads and the height field can never drift apart.
 */
export const PADS: { id: StationId; rInner: number; rOuter: number }[] = [
  { id: 'rig', rInner: 6, rOuter: 13 },
  { id: 'table', rInner: 7, rOuter: 14 },
  { id: 'stage', rInner: 8, rOuter: 16 },
  { id: 'booth', rInner: 5, rOuter: 11 },
  { id: 'machine', rInner: 7, rOuter: 14 },
  { id: 'array', rInner: 8, rOuter: 16 },
];

/**
 * The travelled corridor, as a polyline. Two jobs:
 *   - the terrain damps its displacement near this line so the lens never clips rock;
 *   - the hidden Signal (Phase 7) runs its buried seam along it.
 * It meanders +/-10-12 in X between stations: the brief asks for an S-curve, and a
 * straight run for more than ~30 units kills the sense of travelling through geography.
 */
export const CORRIDOR: [number, number][] = [
  [0, 14],
  [1.5, -4],
  [4, -20],
  [1, -38],
  [-6, -52],
  [-9.5, -60],
  [-6, -74],
  [2, -88],
  [6.5, -100],
  [4, -114],
  [0, -128],
  [-3, -142],
  [-8, -158],
  [-9.5, -168],
  [-6, -182],
  [1, -196],
  [6, -208],
  [4, -222],
  [1, -240],
];

/** Terrain footprint, centred on the corridor. */
export const TERRAIN = {
  // A corridor sheet: long along Z (the direction of travel), narrow across X. A square
  // spends most of its vertices on ground the camera never gets near, which is what
  // forced the grid coarse enough to sample the craters away. Corner radius works out at
  // ~186, so the ridge rings (205 / 240) clear it without intersecting.
  width: 170,
  depth: 330,
  center: [0, 0, -118] as [number, number, number],
};

export const FLOOR = {
  size: 110,
  center: [0, 0, -17] as [number, number, number],
};

/**
 * Camera keyframes — §5, extended for the cinematic overhaul.
 *
 * `hold` marks the plateaus where the dolly parks and orbits. The optional channels
 * below form the ENVIRONMENT TIMELINE: they are interpolated alongside the position and
 * look splines by the single beat sampler in `CameraRig`, which writes the results into
 * the non-reactive `scroll` channel. Fog, post and lights read the channel, never the
 * beats — one sampler, many consumers.
 */
export type CameraKey = {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  hold?: boolean;
  /** Vertical FOV in degrees. The finale needs a wide lens to hold the whole line. */
  fov?: number;
  /**
   * Camera roll in DEGREES, applied after lookAt. Banks into lateral moves only.
   * Film sources put 5–10 deg at "subconscious unease", so the ceiling here is ±1.5
   * sustained; the velocity-driven term adds a little on top.
   */
  roll?: number;
  /**
   * Multiplier on the zone's base fog sigma (1 = the zone table's value). Lets a beat
   * thicken or thin the air without moving the zone boundaries.
   */
  fog?: number;
  /** Pre-tone-map exposure multiplier; 1 = neutral. The finale lifts toward ~1.25. */
  exposure?: number;
  /** Depth-of-field focus distance in world units. 0/undefined = DoF off at this beat. */
  dof?: number;
  beat?: string;
};

/**
 * Atmosphere zones — master doc 3F. Authored per stretch of corridor rather than as one
 * global density, so each reveal lands at its beat's authored distance. `sigma` is the
 * extinction coefficient in `exp(-sigma * d)`; `height` is the falloff `b` in
 * `density(y) = a * e^(-b*y)`.
 *
 * Ordered by descending z (the direction of travel). `zEnd` is exclusive.
 */
export type FogZone = { zStart: number; zEnd: number; sigma: number; height: number; label: string };

export const FOG_ZONES: FogZone[] = [
  { zStart: 14, zEnd: -30, sigma: 0.020, height: 0.10, label: 'establish/hero' },
  { zStart: -30, zEnd: -52, sigma: 0.055, height: 0.075, label: 'bank 1' },
  { zStart: -52, zEnd: -92, sigma: 0.032, height: 0.09, label: 'table to stage' },
  { zStart: -92, zEnd: -136, sigma: 0.048, height: 0.08, label: 'stage to booth gate' },
  { zStart: -136, zEnd: -176, sigma: 0.030, height: 0.09, label: 'machine run' },
  { zStart: -176, zEnd: -216, sigma: 0.026, height: 0.10, label: 'array reverence' },
  { zStart: -216, zEnd: -300, sigma: 0.016, height: 0.11, label: 'finale' },
];

/** Blends the zone table at a world z, so crossing a boundary never pops. */
export function fogAtZ(z: number): { sigma: number; height: number } {
  const zones = FOG_ZONES;
  if (z >= zones[0].zStart) return { sigma: zones[0].sigma, height: zones[0].height };
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (z <= zone.zStart && z > zone.zEnd) {
      const span = zone.zStart - zone.zEnd;
      const f = span > 0 ? (zone.zStart - z) / span : 0;
      // Blend across the last 25% of a zone into the next one.
      const next = zones[i + 1];
      if (next && f > 0.75) {
        const b = (f - 0.75) / 0.25;
        const smooth = b * b * (3 - 2 * b);
        return {
          sigma: zone.sigma + (next.sigma - zone.sigma) * smooth,
          height: zone.height + (next.height - zone.height) * smooth,
        };
      }
      return { sigma: zone.sigma, height: zone.height };
    }
  }
  const last = zones[zones.length - 1];
  return { sigma: last.sigma, height: last.height };
}

/**
 * Moon direction — a UNIT vector from the world toward the moon: ahead and to the RIGHT,
 * mirroring the owner's reference frame (copy sits left on chapter 0, so the disc takes
 * the right third). The journey travels roughly toward its azimuth, so it stays in shot. Everything that must agree about
 * where the light comes from reads this: the moon mesh, its dedicated key light, the
 * corridor key light, the fog's directional in-scatter term, and the environment's
 * Lightformer disc.
 */
export const MOON_DIR: [number, number, number] = (() => {
  const v: [number, number, number] = [0.40, 0.30, -0.87];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

/**
 * THE BEAT TABLE — master doc 3C.
 *
 * Two things about the shape of this data matter more than any individual number.
 *
 * FIRST, heights are AUTHORED ABOVE LOCAL GROUND, not in absolute world Y. The corridor
 * runs across thirty units of relief; an absolute y that frames a machine beautifully at
 * z = -60 puts the lens underground at z = -100. `cameraPath.ts` resolves every `y` here
 * against the terrain at that (x, z), so a beat says "three metres up" and means it
 * everywhere. It is also what stops the whole table going stale whenever the noise is
 * retuned — which is exactly what happened to its predecessor.
 *
 * SECOND, station shots are COMPUTED from each station's own pose rather than typed in.
 * `shotAt` places the camera on an azimuth around the subject and then offsets the LOOK
 * TARGET sideways to push the subject off-centre, so "figure left third, copy right" is
 * expressed as `thirds: 0.33` and stays true if the station moves or the lens changes.
 * Hand-typed coordinates encode the answer; this encodes the intent.
 */

const AUTHOR_ASPECT = 16 / 9;

type Shot = { pos: [number, number, number]; look: [number, number, number] };

/**
 * A framed shot of a subject at (x, z).
 *
 * `az` is the compass bearing of the CAMERA from the subject, with 0 = straight down the
 * corridor on the +Z side, which is where the dolly is coming from, and positive turning
 * toward +X. Stations are rotated to face that approach, so a three-quarter view is the
 * station's own `rotationY` plus about 37 degrees.
 *
 * `thirds` slides the subject across the frame in units of half-frame-width: positive
 * moves it LEFT, leaving the right side for copy; negative moves it right. The maths is
 * the inverse of what the offset does to the camera — shift the look target to
 * camera-right and the subject slides to frame-left.
 */
function shotAt(
  x: number,
  z: number,
  o: { az: number; dist: number; camH: number; lookH: number; fov: number; thirds?: number },
): Shot {
  const a = o.az * DEG;
  const halfW = o.dist * Math.tan((o.fov * DEG) / 2) * AUTHOR_ASPECT;
  const off = (o.thirds ?? 0) * halfW;
  // Camera-right, for a camera sitting at bearing `a` and looking back at the subject.
  const rx = Math.cos(a);
  const rz = -Math.sin(a);
  return {
    pos: [x + Math.sin(a) * o.dist, o.camH, z + Math.cos(a) * o.dist],
    look: [x + rx * off, o.lookH, z + rz * off],
  };
}

/**
 * Subject metrics, MEASURED from the loaded GLBs at their authored scale: `w` is the
 * widest horizontal extent, `mid` the height of the model's vertical centre above its own
 * pad. They are baked here because `world.ts` cannot read a GLB, and framing a hold
 * without them is guesswork — the first pass put every camera roughly twice as far out as
 * it should have been and aimed a metre over the top of every machine, because these
 * models turn out to be three to four units wide and barely one unit tall.
 */
const SUBJECT = {
  rig: { w: 3.5, mid: 0.8 },
  table: { w: 4.1, mid: 0.9 },
  stage: { w: 4.4, mid: 1.2 },
  booth: { w: 2.2, mid: 1.8 },
  machine: { w: 4.2, mid: 0.6 },
  array: { w: 3.5, mid: 1.4 },
};

/**
 * The distance at which a subject `w` units across fills `frac` of the frame's width.
 *
 * Authoring the FRACTION rather than the distance is what keeps a shot's composition
 * intact when its lens changes: widen the fov for drama and the camera steps in to hold
 * the subject the same size, which is what a real operator would do.
 */
const fitDist = (w: number, frac: number, fov: number) =>
  w / (2 * frac * Math.tan((fov * DEG) / 2) * AUTHOR_ASPECT);

const RIG = STATIONS[0];
const TABLE = STATIONS[1];
const STAGE = STATIONS[2];
const BOOTH = STATIONS[3];
const MACHINE = STATIONS[4];
const ARRAY = STATIONS[5];

/** Bearing for a three-quarter view of a station, given which shoulder to favour. */
const threeQuarter = (st: Station, side: 1 | -1) => st.rotationY / DEG + side * 37;

/**
 * The authored beats. Every `y` is metres above the local ground — see the note above.
 *
 * Holds sit at chapter MIDPOINTS, not near chapter ends (Trap #5): a sticky copy block is
 * only fully centred while the viewport centre is at least half the block's height inside
 * its section, so parking the dolly at 89% through a chapter puts the money shot on
 * screen while its own headline is already sliding out of frame.
 *
 *   ch0 [0.00-0.12]  ch1 [0.12-0.30]  ch2 [0.30-0.55]
 *   ch3 [0.55-0.72]  ch4 [0.72-0.88]  ch5 [0.88-1.00]
 */
export const BEATS: CameraKey[] = [
  // --- chapter 0 · DIRECT -----------------------------------------------------------
  {
    t: 0.0,
    pos: [0.5, 6.0, 34],
    look: [2.0, 2.2, -22],
    fov: 54,
    hold: true,
    fog: 0.85,
    beat: 'ESTABLISH — moon, ridge lines, one distant practical',
  },
  {
    t: 0.035,
    pos: [2.0, 4.0, 20],
    look: [2.5, 2.0, -20],
    fov: 48,
    beat: 'begin travel — descend toward the corridor floor',
  },
  {
    t: 0.06,
    ...shotAt(RIG.position[0], RIG.position[2], {
      az: threeQuarter(RIG, 1),
      dist: fitDist(SUBJECT.rig.w, 0.32, 42),
      camH: 2.4,
      lookH: SUBJECT.rig.mid,
      fov: 42,
      thirds: -0.34,
    }),
    fov: 42,
    hold: true,
    beat: 'hero hold — the rig in 3/4, copy in the left negative space',
  },
  {
    t: 0.1,
    pos: [8.5, 2.8, -27],
    look: [-1.0, 1.8, -42],
    fov: 44,
    roll: 0.9,
    beat: 'hero pass — arc past the rig, it exits frame right',
  },
  {
    t: 0.12,
    pos: [4.0, 2.8, -35],
    look: [-6.0, 1.8, -50],
    fov: 44,
    beat: 'departure — rig lights shrink behind, banks build at the frame edges',
  },

  // --- chapter 1 · PRODUCE ----------------------------------------------------------
  {
    t: 0.15,
    pos: [-2.5, 2.5, -43],
    look: [-8.0, 1.6, -56],
    fov: 46,
    fog: 1.35,
    exposure: 0.86,
    beat: 'fog entry — visibility collapses, darkest travel beat',
  },
  {
    t: 0.175,
    pos: [-5.5, 2.7, -49],
    look: [-9.0, 1.8, -59],
    fov: 44,
    fog: 1.15,
    beat: 'discovery — table silhouette and surface glow through haze',
  },
  {
    t: 0.21,
    ...shotAt(TABLE.position[0], TABLE.position[2], {
      az: threeQuarter(TABLE, -1),
      dist: fitDist(SUBJECT.table.w, 0.34, 42),
      camH: 2.6,
      lookH: SUBJECT.table.mid,
      fov: 42,
      thirds: 0.33,
    }),
    fov: 42,
    hold: true,
    beat: 'table hold — over-the-shoulder, figure left third, copy right',
  },
  {
    t: 0.26,
    pos: [-5.0, 1.9, -70],
    look: [0.0, 1.6, -84],
    fov: 45,
    roll: -0.8,
    beat: 'table pass — low skim past the table edge',
  },
  {
    t: 0.3,
    pos: [0.5, 3.2, -82],
    look: [7.0, 2.2, -99],
    fov: 45,
    fog: 0.9,
    beat: 'transition — open terrain, distant stage glow appears',
  },

  // --- chapter 2 · MULTIPLY ---------------------------------------------------------
  {
    t: 0.34,
    ...shotAt(STAGE.position[0], STAGE.position[2], {
      az: 6,
      dist: fitDist(SUBJECT.stage.w, 0.12, 45),
      camH: 3.4,
      lookH: SUBJECT.stage.mid,
      fov: 45,
    }),
    fov: 45,
    beat: 'stage approach — centreline, symmetric',
  },
  {
    t: 0.42,
    ...shotAt(STAGE.position[0], STAGE.position[2], {
      az: threeQuarter(STAGE, 1),
      dist: fitDist(SUBJECT.stage.w, 0.36, 42),
      camH: 2.8,
      lookH: SUBJECT.stage.mid,
      fov: 42,
      thirds: -0.22,
    }),
    fov: 42,
    hold: true,
    beat: 'stage hold — push-in complete, monitors orbiting',
  },
  {
    t: 0.48,
    pos: [5.5, 3.6, -113],
    look: [0.5, 2.6, -128],
    fov: 44,
    roll: 0.7,
    beat: 'stage depart — pull off axis, the booth silhouette ahead',
  },
  {
    t: 0.52,
    ...shotAt(BOOTH.position[0], BOOTH.position[2], {
      az: 0,
      dist: fitDist(SUBJECT.booth.w, 0.16, 46),
      camH: 2.6,
      lookH: SUBJECT.booth.mid,
      fov: 46,
    }),
    fov: 46,
    fog: 1.25,
    beat: 'booth approach — dead-on',
  },
  {
    t: 0.545,
    pos: [0.0, 2.7, -127],
    look: [-0.5, 2.3, -142],
    fov: 52,
    fog: 1.5,
    exposure: 0.78,
    beat: 'FLY-THROUGH — panel flash, one beat of near-black on exit',
  },

  // --- chapter 3 · DISTRIBUTE -------------------------------------------------------
  {
    t: 0.57,
    pos: [-1.0, 2.9, -141],
    look: [-7.5, 1.9, -158],
    fov: 46,
    fog: 1.1,
    beat: 'emerge — the machine hub appears low-left through thinning haze',
  },
  {
    t: 0.6,
    pos: [-1.5, 2.7, -156],
    look: [-11.0, 1.9, -166],
    fov: 45,
    roll: -1.1,
    beat: 'lateral run — parallel to the panel row, ignitions chase',
  },
  {
    t: 0.635,
    ...shotAt(MACHINE.position[0], MACHINE.position[2], {
      az: threeQuarter(MACHINE, -1),
      dist: fitDist(SUBJECT.machine.w, 0.34, 44),
      camH: 5.2,
      lookH: SUBJECT.machine.mid,
      fov: 44,
      thirds: 0.22,
    }),
    fov: 44,
    hold: true,
    beat: 'machine hold — 3/4 top-down on the row',
  },
  {
    t: 0.69,
    pos: [-6.0, 3.6, -185],
    look: [6.0, 2.4, -204],
    fov: 46,
    beat: 'depart — the row recedes, array glow far right',
  },

  // --- chapter 4 · MEASURE ----------------------------------------------------------
  {
    t: 0.73,
    ...shotAt(ARRAY.position[0], ARRAY.position[2], {
      az: 4,
      dist: fitDist(SUBJECT.array.w, 0.1, 34),
      camH: 4.4,
      lookH: SUBJECT.array.mid,
      fov: 34,
      thirds: -0.4,
    }),
    fov: 34,
    fog: 0.85,
    beat: 'array distant — long-lens reverence, big negative space',
  },
  {
    t: 0.8,
    ...shotAt(ARRAY.position[0], ARRAY.position[2], {
      az: threeQuarter(ARRAY, 1),
      dist: fitDist(SUBJECT.array.w, 0.3, 40),
      camH: 3.0,
      lookH: SUBJECT.array.mid,
      fov: 40,
      thirds: -0.33,
    }),
    fov: 40,
    hold: true,
    beat: 'array hold — dish at one-third, network pulses visible',
  },
  {
    t: 0.86,
    pos: [17.0, 4.8, -216],
    look: [8.0, 2.2, -208],
    fov: 44,
    roll: 1.2,
    beat: 'last pass — slide past the dish rim and pull away',
  },

  // --- chapter 5 · THE REVEAL -------------------------------------------------------
  {
    t: 0.88,
    pos: [4.0, 30.0, -228],
    look: [2.0, 2.0, -190],
    fov: 52,
    fog: 0.7,
    beat: 'crane begins — rise and turn back, the fog thins',
  },
  {
    // Mid-crane. Not decoration: the rise from the corridor floor to ninety metres is the
    // longest single segment in the table, and a Catmull-Rom spline with one segment far
    // longer than its neighbours bulges outward through it. This control point keeps the
    // arc where it was drawn.
    t: 0.91,
    pos: [-4.0, 60.0, -240.0],
    look: [1.0, 1.0, -170.0],
    fov: 53,
    fog: 0.62,
    exposure: 1.1,
    beat: 'crane mid — the corridor opens out below',
  },
  /**
   * The reveal is the one pose in the table that was SOLVED rather than composed: the
   * requirement is that all six machines are simultaneously inside the frame, and whether
   * a given crane satisfies that is a projection question, not a matter of taste. Sweeping
   * camera position, look target and focal length against the six station positions gives
   * this one — behind the array, ninety metres up, looking back along the whole line the
   * viewer has just travelled. Every pose that framed the line from the FRONT lost the
   * near stations off the bottom of the frame; this is why the crane turns back.
   */
  {
    t: 0.94,
    pos: [-16.0, 92.0, -246.0],
    look: [0.0, 0.0, -150.0],
    fov: 55,
    hold: true,
    fog: 0.55,
    exposure: 1.2,
    beat: 'THE REVEAL — the whole corridor below, ST0 through ST5 activating',
  },
  {
    t: 1.0,
    pos: [-22.0, 98.0, -256.0],
    look: [0.0, 0.0, -150.0],
    fov: 55,
    hold: true,
    fog: 0.5,
    exposure: 1.25,
    beat: 'settle — slow drift, CTA, the system idles alive',
  },
];

/** One hold key per chapter, in order. Consumed by the reduced-motion pose table. */
export const HOLD_KEY_FOR_CHAPTER = [0.06, 0.21, 0.42, 0.635, 0.8, 0.94];

export const VOID_COLOR = '#050607';
export const ACCENT = '#7dffa0';
export const FOG_BASE = 0.038;

/**
 * Palette — master doc 2/3E. The ramp is BLACK -> shadow -> dark green -> muted green
 * -> emerald highlight, and large parts of every frame stay at the black end. Green is
 * never a filter: these are the colours of LIGHT SOURCES and of what they fall on.
 */
export const PALETTE = {
  /** Deepest black in the piece; scene background backstop and dome zenith. */
  black: '#010302',
  /** Sky dome horizon — MUST equal the fog's far colour or geometry won't dissolve. */
  horizon: '#0a1710',
  /** Fog base colour away from the moon direction: cold charcoal, barely green. */
  fogBase: '#080d0b',
  /** Fog colour looking INTO the moon — where the emerald in-scatter lives. */
  fogMoon: '#2a5f45',
  /** Regolith at its darkest (deep crevices). */
  terrainLow: '#080a09',
  /** Regolith on lit flats. */
  terrainHigh: '#1d2622',
  /** Moon key light — desaturated; saturation is reserved for practicals. */
  moonLight: '#9dbfa8',
  /** The moon's own dedicated key (layer 2), brighter than the corridor's. */
  moonDisc: '#dfffe8',
  /** Station practical lights. */
  practical: '#35e08a',
  /** Hero accent practical. */
  practicalHero: '#bfe8cf',
  /** Ambient occlusion tint — occlusion reads deep green, not dead black. */
  ao: '#06110a',
} as const;
