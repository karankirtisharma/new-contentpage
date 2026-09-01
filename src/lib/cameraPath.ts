import { BEATS, HOLD_KEY_FOR_CHAPTER, type CameraKey } from './world';
import { heightAt } from './terrain';

/**
 * Resolves the authored beat table into world space.
 *
 * `world.ts` states shots in terms the author actually thinks in — "three metres above
 * the ground, fourteen out from the rig, favouring its left shoulder". This module turns
 * those into absolute coordinates by asking the terrain how high the ground is under each
 * point. That is the whole job, and it lives in its own file for one structural reason:
 * `terrain.ts` imports the station and corridor data from `world.ts`, so `world.ts` can
 * never import back from it. The dependency runs world → terrain → cameraPath, and
 * everything downstream reads `CAMERA_KEYS` from here.
 *
 * Note that this is NOT the same guarantee as `groundCamera`, and both are needed.
 * This one preserves the AUTHORED framing: a beat asking for 3.0m of altitude gets 3.0m
 * of altitude at that spot, so the shot composes the way it was designed to. `groundCamera`
 * is the runtime floor, catching the places the interpolated spline dips between two
 * legal beats — the curve does not know it has to stay above a ridge that sits between
 * its control points.
 */

function resolve(p: [number, number, number]): [number, number, number] {
  return [p[0], heightAt(p[0], p[2]) + p[1], p[2]];
}

export const CAMERA_KEYS: CameraKey[] = BEATS.map((k) => ({
  ...k,
  pos: resolve(k.pos),
  look: resolve(k.look),
}));

/**
 * Per-chapter static poses for prefers-reduced-motion, one hold key per chapter in order.
 *
 * Derived from the hold keys rather than duplicated: hand-copied poses silently drift out
 * of sync the moment a keyframe is retuned, and the reduced-motion path is the one nobody
 * re-checks. The throw is deliberate — if a hold time moves, this fails at load rather
 * than quietly serving chapter 3's pose for chapter 4.
 */
export const REDUCED_POSES: { pos: [number, number, number]; look: [number, number, number] }[] =
  HOLD_KEY_FOR_CHAPTER.map((t) => {
    const key = CAMERA_KEYS.find((k) => Math.abs(k.t - t) < 1e-6);
    if (!key) throw new Error(`No camera key at t=${t} for the reduced-motion pose table`);
    return { pos: key.pos, look: key.look };
  });
