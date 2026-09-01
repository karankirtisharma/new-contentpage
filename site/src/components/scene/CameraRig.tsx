'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fogAtZ, type CameraKey } from '@/lib/world';
import { CAMERA_KEYS, REDUCED_POSES } from '@/lib/cameraPath';
import { groundCamera } from '@/lib/terrain';
import { chapterFromT, scroll, useSignal } from '@/lib/store';

/**
 * Camera choreography — §5.
 *
 * Two CatmullRom splines (position + look target) sampled by an eased master `t`.
 * The ease is piecewise: `remapHold` flattens dt around every keyframe flagged
 * `hold: true`, so the dolly parks at each station instead of gliding past it.
 * During a hold the camera performs a slow +/-4 degree orbit and picks up mouse
 * parallax, which is what makes a station feel inspected rather than driven past.
 */

/**
 * Piecewise hold easing.
 *
 * An earlier version redistributed `t` through a global CDF, which slowed the camera
 * near holds but also moved every keyframe off its authored time — at raw t = 0.28 the
 * camera arrived at the stage instead of the drafting table. This version eases only
 * WITHIN each segment, so `remap(k.t) === k.t` for every key by construction and the
 * §5 table stays authoritative.
 *
 * A segment that starts at a hold accelerates out of it; one that ends at a hold
 * decelerates into it; a segment between two holds does both. Monotonic, so reverse
 * scroll reconstructs identical states.
 */
const HOLD_P = 2.6;

function remapHold(t: number) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
    const a = CAMERA_KEYS[i];
    const b = CAMERA_KEYS[i + 1];
    if (clamped > b.t && i < CAMERA_KEYS.length - 2) continue;
    const span = b.t - a.t;
    if (span <= 0) continue;
    const f = THREE.MathUtils.clamp((clamped - a.t) / span, 0, 1);

    let eased: number;
    if (a.hold && b.hold) {
      // dwell at both ends
      eased = f < 0.5
        ? 0.5 * Math.pow(2 * f, HOLD_P)
        : 1 - 0.5 * Math.pow(2 * (1 - f), HOLD_P);
    } else if (a.hold) {
      eased = Math.pow(f, HOLD_P);          // slow leaving the hold
    } else if (b.hold) {
      eased = 1 - Math.pow(1 - f, HOLD_P);  // slow arriving at the hold
    } else {
      eased = f;                            // transit runs linear
    }

    return a.t + eased * span;
  }
  return clamped;
}

/**
 * Linear interpolation of any per-beat channel between the two keys bracketing `t`.
 *
 * A beat carries more than a pose: focal length, roll, fog multiplier, exposure and DoF
 * are all authored on the same keys, and every one of them wants exactly this lookup.
 * `?? fallback` per endpoint rather than per key means a beat can leave a channel
 * unspecified and simply inherit the default without pinning its neighbours to it.
 */
function channelAt(t: number, pick: (k: CameraKey) => number | undefined, fallback: number) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
    const a = CAMERA_KEYS[i];
    const b = CAMERA_KEYS[i + 1];
    if (clamped > b.t && i < CAMERA_KEYS.length - 2) continue;
    const span = b.t - a.t;
    const f = span > 0 ? THREE.MathUtils.clamp((clamped - a.t) / span, 0, 1) : 0;
    return THREE.MathUtils.lerp(pick(a) ?? fallback, pick(b) ?? fallback, f);
  }
  return fallback;
}

/**
 * Position on the spline in *key-index* space.
 *
 * `getPoint` (index space), never `getPointAt` (arc-length space): the §5 keys are
 * spaced by narrative beat, not by distance, so arc-length reparameterisation would
 * slide every pose away from its authored `t`.
 */
function keyU(t: number) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const n = CAMERA_KEYS.length - 1;
  for (let i = 0; i < n; i++) {
    if (clamped <= CAMERA_KEYS[i + 1].t) {
      const span = CAMERA_KEYS[i + 1].t - CAMERA_KEYS[i].t;
      const f = span > 0 ? (clamped - CAMERA_KEYS[i].t) / span : 0;
      return (i + f) / n;
    }
  }
  return 1;
}

/**
 * Portrait compensation.
 *
 * `camera.fov` is vertical, so a 9:19.5 phone sees far less horizontally than the
 * 16:9 the §5 poses were framed for and every station crops. Rather than blowing the
 * FOV out to ~110 degrees (which distorts the machines), the camera dollies back from
 * its look target and widens modestly, both capped.
 */
const REF_ASPECT = 16 / 9;
const DEG_TO_RAD = Math.PI / 180;

function framingFor(aspect: number) {
  const ratio = THREE.MathUtils.clamp(REF_ASPECT / Math.max(aspect, 0.3), 1, 2.4);
  return {
    dolly: THREE.MathUtils.lerp(1, 1.62, THREE.MathUtils.clamp((ratio - 1) / 1.4, 0, 1)),
    fovScale: THREE.MathUtils.lerp(1, 1.22, THREE.MathUtils.clamp((ratio - 1) / 1.4, 0, 1)),
  };
}

export default function CameraRig({ handOff = false }: { handOff?: boolean } = {}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useSignal((s) => s.reducedMotion);

  // Dev handle: lets the choreography be scrubbed without driving the DOM scroll.
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    (window as unknown as { __scroll?: typeof scroll }).__scroll = scroll;
  }

  const { posCurve, lookCurve } = useMemo(() => {
    const posCurve = new THREE.CatmullRomCurve3(
      CAMERA_KEYS.map((k) => new THREE.Vector3(...k.pos)),
      false,
      'catmullrom',
      0.4,
    );
    const lookCurve = new THREE.CatmullRomCurve3(
      CAMERA_KEYS.map((k) => new THREE.Vector3(...k.look)),
      false,
      'catmullrom',
      0.4,
    );
    return { posCurve, lookCurve };
  }, []);

  const pos = useRef(new THREE.Vector3(...CAMERA_KEYS[0].pos));
  const look = useRef(new THREE.Vector3(...CAMERA_KEYS[0].look));
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const orbit = useRef(new THREE.Vector3());
  const lastT = useRef(0);
  const roll = useRef(0);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);

    // DEMAND MODE, SELF-SUSTAINING. The canvas only renders when something asks it to, and
    // a scroll event asks for exactly one frame — but `scroll.t` is DAMPED toward its
    // target and takes about forty frames to arrive, so one frame per event would leave
    // the camera visibly crawling after the scroll stopped. While anything is still in
    // motion this requests the next frame itself; when everything has settled it stops
    // asking and the idle heartbeat takes over.
    if (
      Math.abs(scroll.target - scroll.t) > 1e-4 ||
      scroll.speed > 1e-3 ||
      Math.abs(scroll.pointer.x - scroll.parallax.x) > 1e-3 ||
      Math.abs(scroll.pointer.y - scroll.parallax.y) > 1e-3
    ) {
      invalidate();
    }

    // --- master smoothing: tSmooth += (tRaw - tSmooth) * 0.08 (frame-rate corrected)
    const k = 1 - Math.pow(1 - 0.08, dt * 60);
    scroll.t += (scroll.target - scroll.t) * k;

    const raw = scroll.t;
    scroll.velocity = (raw - lastT.current) / Math.max(dt, 1e-4);
    lastT.current = raw;
    scroll.speed += (Math.min(Math.abs(scroll.velocity) * 2.2, 1) - scroll.speed) * (1 - Math.pow(0.86, dt * 60));

    // --- pointer parallax, lerp 0.06
    const pk = 1 - Math.pow(1 - 0.06, dt * 60);
    scroll.parallax.x += (scroll.pointer.x - scroll.parallax.x) * pk;
    scroll.parallax.y += (scroll.pointer.y - scroll.parallax.y) * pk;

    // ?debug=1&orbit=1 hands the camera to OrbitControls, but the scroll maths above
    // still has to run — every station's idle motion reads scroll.t.
    if (handOff) return;

    if (reducedMotion) {
      const pose = REDUCED_POSES[chapterFromT(scroll.target)] ?? REDUCED_POSES[0];
      targetPos.current.set(...pose.pos);
      targetLook.current.set(...pose.look);
      const rmFraming = framingFor(camera.aspect);
      if (rmFraming.dolly > 1.001) {
        targetPos.current.sub(targetLook.current).multiplyScalar(rmFraming.dolly).add(targetLook.current);
      }
      targetPos.current.y = groundCamera(targetPos.current.x, targetPos.current.y, targetPos.current.z);
      const rk = 1 - Math.pow(1 - 0.05, dt * 60);
      pos.current.lerp(targetPos.current, rk);
      look.current.lerp(targetLook.current, rk);
      camera.position.copy(pos.current);
      camera.lookAt(look.current);
      scroll.look.x = look.current.x;
      scroll.look.y = look.current.y;
      scroll.look.z = look.current.z;

      const rzone = fogAtZ(camera.position.z);
      scroll.fogSigma = rzone.sigma;
      scroll.fogHeight = rzone.height;
      return;
    }

    const eased = remapHold(raw);
    const u = keyU(eased);
    posCurve.getPoint(u, targetPos.current);
    lookCurve.getPoint(u, targetLook.current);

    // --- hold orbit: a slow +/-4deg swing that only has authority while parked
    const parked = 1 - THREE.MathUtils.clamp(scroll.speed * 3.2, 0, 1);
    const time = state.clock.elapsedTime;
    const swing = Math.sin(time * 0.22) * 0.07 * parked;
    orbit.current.copy(targetPos.current).sub(targetLook.current);
    const radius = orbit.current.length();
    const theta = Math.atan2(orbit.current.x, orbit.current.z) + swing;
    const yBias = Math.cos(time * 0.17) * 0.05 * parked * radius * 0.1;

    targetPos.current.x = targetLook.current.x + Math.sin(theta) * Math.hypot(orbit.current.x, orbit.current.z);
    targetPos.current.z = targetLook.current.z + Math.cos(theta) * Math.hypot(orbit.current.x, orbit.current.z);
    targetPos.current.y += yBias;

    // --- mouse parallax, +/-0.12 rad about the look target, damped while moving
    const px = scroll.parallax.x * 0.12 * parked;
    const py = scroll.parallax.y * 0.07 * parked;
    targetPos.current.x += px * radius * 0.35;
    targetPos.current.y += py * radius * 0.3;

    // Portrait: push the camera back along its own view vector before committing.
    const framing = framingFor(camera.aspect);
    if (framing.dolly > 1.001) {
      targetPos.current.sub(targetLook.current).multiplyScalar(framing.dolly).add(targetLook.current);
    }

    // GROUND THE DOLLY. The beats describe the shot; the terrain decides whether that
    // shot is physically possible. Without this the camera flies through ridges — the
    // authored y values cannot know what the noise put underneath them.
    targetPos.current.y = groundCamera(targetPos.current.x, targetPos.current.y, targetPos.current.z);

    pos.current.copy(targetPos.current);
    look.current.lerp(targetLook.current, 1 - Math.pow(1 - 0.35, dt * 60));

    camera.position.copy(pos.current);
    camera.lookAt(look.current);
    scroll.look.x = look.current.x;
    scroll.look.y = look.current.y;
    scroll.look.z = look.current.z;

    // Subtle roll with lateral velocity — a dolly on a real rail is never perfectly
    // level. lookAt() rewrites rotation.z every frame, so the roll is a damped value
    // held on a ref and applied after, never accumulated onto the camera itself.
    // Authored bank from the beat, plus the velocity term on top. The beats carry roll in
    // DEGREES because that is the unit an operator thinks in; the ceiling is +-1.5 deg
    // sustained, which film sources put well below the threshold where a tilted horizon
    // starts reading as unease rather than as momentum.
    const authoredRoll = channelAt(eased, (k) => k.roll, 0) * DEG_TO_RAD;
    const rollTarget =
      authoredRoll + THREE.MathUtils.clamp(-scroll.velocity * 0.004, -0.03, 0.03);
    roll.current += (rollTarget - roll.current) * (1 - Math.pow(1 - 0.06, dt * 60));
    camera.rotation.z += roll.current;

    // --- environment timeline. The zone table owns the character of the air at each
    // point in the corridor; the per-beat `fog` value is a MULTIPLIER on it, so a beat
    // can call for thicker air without re-authoring the zone it sits in. Everything
    // downstream — the fog chunk, the cards, the grade — reads these and nothing else,
    // which is what keeps the atmosphere a property of the WORLD rather than of the shot.
    const zone = fogAtZ(camera.position.z);
    // Travelling fast stirs the regolith: up to +10% density at full scroll speed (3F).
    scroll.fogSigma = zone.sigma * channelAt(eased, (k) => k.fog, 1) * (1 + scroll.speed * 0.1);
    scroll.fogHeight = zone.height;
    scroll.exposure = channelAt(eased, (k) => k.exposure, 1);
    scroll.dof = channelAt(eased, (k) => k.dof, 0);
    scroll.roll = roll.current;

    // Focal length comes from the keys; scroll speed only breathes it a little.
    const fov = channelAt(eased, (k) => k.fov, 42) * framing.fovScale + scroll.speed * 3.0;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (1 - Math.pow(1 - 0.12, dt * 60));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
