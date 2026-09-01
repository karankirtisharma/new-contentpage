'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SIGNAL_PATH, STATIONS } from '@/lib/world';
import { CAMERA_KEYS } from '@/lib/cameraPath';
import { scroll } from '@/lib/store';

/**
 * `?debug=1` — the dev scrubber from §5.
 *
 * Draws the camera position spline, the look-target spline, a marker per keyframe,
 * the Signal path and a bounding box per station. `?debug=1&orbit=1` additionally
 * hands the camera to OrbitControls and exposes `__pose()`, which prints the current
 * position and target as a ready-to-paste CAMERA_KEYS row.
 */
export default function Debug({ orbit }: { orbit: boolean }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const controls = useRef(null);

  const { posLine, lookLine, conduitLine, keyPoints } = useMemo(() => {
    const build = (pts: THREE.Vector3[]) => {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
      return new THREE.BufferGeometry().setFromPoints(curve.getPoints(400));
    };
    return {
      posLine: build(CAMERA_KEYS.map((k) => new THREE.Vector3(...k.pos))),
      lookLine: build(CAMERA_KEYS.map((k) => new THREE.Vector3(...k.look))),
      conduitLine: build(SIGNAL_PATH.map(([x, z]) => new THREE.Vector3(x, 0.6, z))),
      keyPoints: CAMERA_KEYS,
    };
  }, []);

  // Part 7's gates are measurements, not opinions: on-screen triangles per shot, draw
  // calls, which object is responsible for a given pixel. All of that needs a handle on
  // the renderer from the console, so debug mode publishes one.
  useEffect(() => {
    const w = window as unknown as { __three?: unknown };
    w.__three = { gl, scene, camera, keys: CAMERA_KEYS, stats: () => ({ ...gl.info.render, ...gl.info.memory }) };
    return () => {
      delete w.__three;
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const w = window as unknown as { __pose?: () => string };
    w.__pose = () => {
      const target = (controls.current as unknown as { target: THREE.Vector3 } | null)?.target;
      const p = camera.position;
      // Emit the FULL beat shape so a pasted row never silently drops a channel the
      // environment timeline expects.
      const row =
        `{ t: ${scroll.t.toFixed(3)}, ` +
        `pos: [${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}], ` +
        `look: [${(target?.x ?? 0).toFixed(1)}, ${(target?.y ?? 0).toFixed(1)}, ${(target?.z ?? 0).toFixed(1)}], ` +
        `fov: ${Math.round((camera as THREE.PerspectiveCamera).fov)}, ` +
        `roll: 0, fog: 1, exposure: 1, dof: 0, beat: '' },`;
      console.log(row);
      return row;
    };
    return () => {
      delete w.__pose;
    };
  }, [camera]);

  useFrame(() => {
    if (!orbit) return;
    // Keep the scene animating at the scrubbed t while the camera is hand-flown.
    scroll.speed *= 0.9;
  });

  return (
    <>
      {orbit && <OrbitControls ref={controls} makeDefault target={[0, 1, -113]} />}

      <line>
        <primitive object={posLine} attach="geometry" />
        <lineBasicMaterial color="#ff5f57" toneMapped={false} />
      </line>
      <line>
        <primitive object={lookLine} attach="geometry" />
        <lineBasicMaterial color="#57a5ff" toneMapped={false} />
      </line>
      <line>
        <primitive object={conduitLine} attach="geometry" />
        <lineBasicMaterial color="#ffd166" toneMapped={false} />
      </line>

      {keyPoints.map((k) => (
        <mesh key={`p${k.t}`} position={k.pos}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshBasicMaterial color={k.hold ? '#ffffff' : '#ff5f57'} toneMapped={false} />
        </mesh>
      ))}
      {keyPoints.map((k) => (
        <mesh key={`l${k.t}`} position={k.look}>
          <boxGeometry args={[0.14, 0.14, 0.14]} />
          <meshBasicMaterial color="#57a5ff" toneMapped={false} />
        </mesh>
      ))}

      {STATIONS.map((s) => (
        <box3Helper
          key={s.id}
          args={[
            new THREE.Box3().setFromCenterAndSize(
              new THREE.Vector3(s.position[0], s.position[1] + s.scale * 0.25, s.position[2]),
              new THREE.Vector3(s.scale, s.scale * 0.5, s.scale),
            ),
            new THREE.Color('#7dffa0'),
          ]}
        />
      ))}

      <gridHelper args={[300, 60, '#204030', '#122018']} position={[0, 0.01, -113]} />
      <axesHelper args={[2]} />
    </>
  );
}
