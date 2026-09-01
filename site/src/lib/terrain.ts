import { CORRIDOR, PADS, STATIONS } from './world';
import { makeHeightFn, type Pad } from './terrainNoise';

/**
 * The single source of ground truth for "how high is the surface at (x, z)".
 *
 * This lives in lib rather than in the Terrain component because four separate systems
 * have to agree with it or the world falls apart:
 *   - the terrain mesh itself (it IS this function, sampled on a grid)
 *   - the boulder scatter (rocks must bed into the ground, not hover)
 *   - the station shelves (a machine half-buried or floating kills the whole illusion)
 *   - the CAMERA, which has to fly ABOVE the landscape rather than through it
 *
 * Importing it from a component would make CameraRig depend on Terrain, which is
 * backwards; the geometry is downstream of the height field, not the other way round.
 */

/**
 * Resolving the pads is a two-step because it is genuinely circular: a pad's height comes
 * from the terrain, and the terrain's height comes from the pads. Break it by evaluating
 * the surface with NO pads first — geology, craters and the corridor grading — and seat
 * each shelf on that. Seating on raw geology instead (the obvious shortcut) puts every
 * station a unit above ground, because the grading has not been applied yet.
 */
const ungraded = makeHeightFn({ pads: [], corridor: CORRIDOR });

/** Station shelves, seated on the graded surface rather than on y = 0 or on raw noise. */
export const PAD_LIST: Pad[] = PADS.map((p) => {
  const st = STATIONS.find((s) => s.id === p.id)!;
  const [x, , z] = st.position;
  return { x, z, y: ungraded(x, z), rInner: p.rInner, rOuter: p.rOuter };
});

export const heightAt = makeHeightFn({ pads: PAD_LIST, corridor: CORRIDOR });

// Publish the resolved shelf height back onto the stations, so Station.tsx places its
// GLB on the shelf the terrain actually built.
PAD_LIST.forEach((pad, i) => {
  const st = STATIONS.find((s) => s.id === PADS[i].id)!;
  st.position[1] = pad.y;
});

/**
 * Minimum camera clearance above the regolith, in world units. The dolly is a drone: it
 * skims, it never grazes. Anything under ~1.2 and a boulder crest can clip the near plane.
 */
export const CAMERA_CLEARANCE = 1.6;

/**
 * Lifts a camera position so it always clears the ground beneath it. The authored beats
 * describe the SHOT; this guarantees the shot is physically possible on the terrain that
 * ended up under it — without it, every beat would have to be re-derived by hand every
 * time the noise seed changes.
 */
export function groundCamera(x: number, y: number, z: number): number {
  const ground = heightAt(x, z);
  const min = ground + CAMERA_CLEARANCE;
  return y < min ? min : y;
}
