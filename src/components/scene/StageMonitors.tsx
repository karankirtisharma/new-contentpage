'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STATION_BY_ID } from '@/lib/world';
import { scroll, useSignal } from '@/lib/store';

/**
 * The stage's floating monitors — §6, stage row.
 *
 * Three 16:9 planes orbiting the turntable at r = 2.2, y = 1.3, fading up 0.4 s apart
 * as chapter 2 opens.
 *
 * The real reels have not been delivered (§12 open items), so each monitor runs a
 * procedural playback surface on a CanvasTexture — timecode, safe-area marks, a live
 * audio waveform and a scrubbing playhead. Dropping files into /public/reels and
 * setting REEL_SOURCES swaps every monitor to a lazy VideoTexture with no other change.
 */

const REEL_SOURCES: string[] = []; // e.g. ['/reels/launch.mp4', ...]

const REELS = [
  { code: 'CYN_LAUNCH_TRAILER', dur: '00:47', tint: '#7dffa0' },
  { code: 'CYN_FOUNDER_S02E04', dur: '01:12', tint: '#8affb0' },
  { code: 'CYN_TOKENOMICS_ANIM', dur: '00:38', tint: '#6be894' },
];

function makeReelCanvas(index: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  return { canvas, ctx: canvas.getContext('2d')!, index };
}

function paintReel(
  { canvas, ctx, index }: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; index: number },
  time: number,
) {
  const w = canvas.width;
  const h = canvas.height;
  const reel = REELS[index % REELS.length];
  const t = time * 0.35 + index * 3.1;

  ctx.fillStyle = '#04120b';
  ctx.fillRect(0, 0, w, h);

  // Drifting subject blob — stands in for footage until the real reels land.
  const grad = ctx.createRadialGradient(
    w * (0.5 + Math.sin(t * 0.4) * 0.16),
    h * (0.46 + Math.cos(t * 0.31) * 0.1),
    8,
    w * 0.5,
    h * 0.5,
    w * 0.62,
  );
  grad.addColorStop(0, reel.tint);
  grad.addColorStop(0.28, 'rgba(80,200,130,0.35)');
  grad.addColorStop(1, 'rgba(4,18,11,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Horizontal scan bands.
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#000';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;

  // Safe-area / framing marks.
  ctx.strokeStyle = 'rgba(180,255,205,0.32)';
  ctx.lineWidth = 1;
  ctx.strokeRect(w * 0.1, h * 0.1, w * 0.8, h * 0.8);
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.44);
  ctx.lineTo(w / 2, h * 0.56);
  ctx.moveTo(w * 0.46, h / 2);
  ctx.lineTo(w * 0.54, h / 2);
  ctx.stroke();

  // Audio waveform along the bottom.
  ctx.strokeStyle = reel.tint;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let x = 0; x < w; x += 4) {
    const a =
      Math.sin(x * 0.09 + t * 3.2) * Math.sin(x * 0.021 + t * 1.1) * 12 +
      Math.sin(x * 0.31 + t * 6.0) * 4;
    ctx.moveTo(x, h - 26 - a);
    ctx.lineTo(x, h - 26 + a);
  }
  ctx.stroke();

  // Timecode + REC dot.
  ctx.font = '600 15px ui-monospace, "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(210,255,225,0.92)';
  const secs = Math.floor(time * 24) % 1440;
  const tc = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}:${String(
    Math.floor(time * 24) % 24,
  ).padStart(2, '0')}`;
  ctx.fillText(tc, 16, 26);
  ctx.fillText(reel.code, 16, h - 12);
  ctx.textAlign = 'right';
  ctx.fillText(reel.dur, w - 16, h - 12);
  ctx.textAlign = 'left';

  if (Math.sin(time * 3.4) > 0) {
    ctx.fillStyle = '#ff5f57';
    ctx.beginPath();
    ctx.arc(w - 22, 21, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Playhead.
  const p = (time * 0.11 + index * 0.3) % 1;
  ctx.fillStyle = 'rgba(125,255,160,0.25)';
  ctx.fillRect(w * 0.1, h - 6, w * 0.8, 2);
  ctx.fillStyle = reel.tint;
  ctx.fillRect(w * 0.1, h - 7, w * 0.8 * p, 4);
}

export default function StageMonitors({ count }: { count: number }) {
  const stage = STATION_BY_ID.stage;
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.Mesh[]>([]);
  const setLightbox = useSignal((s) => s.setLightbox);

  const reels = useMemo(
    () =>
      Array.from({ length: Math.min(count, REELS.length) }, (_, i) => {
        const surface = makeReelCanvas(i);
        const texture = new THREE.CanvasTexture(surface.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          toneMapped: false,
          side: THREE.DoubleSide,
        });
        return { surface, texture, material, index: i };
      }),
    [count],
  );

  useEffect(() => {
    return () => {
      reels.forEach((r) => {
        r.texture.dispose();
        r.material.dispose();
      });
    };
  }, [reels]);

  const lastPaint = useRef(0);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;

    const t = scroll.t;
    const active = t > 0.28 && t < 0.58;
    g.visible = active;
    if (!active) return;

    const time = state.clock.elapsedTime;

    // Repaint at 12 Hz, not every frame. Each reel is a 2D canvas redrawn and re-uploaded
    // to the GPU, which is by far the most expensive thing in this file — and these are
    // small panels orbiting a turntable at three metres, where nobody can tell 12 fps from
    // 60. The orbit and the fades below still run every frame, so the MOTION stays smooth;
    // it is only the picture on the screens that is throttled.
    const repaint = time - lastPaint.current >= 1 / 12;
    if (repaint) lastPaint.current = time;

    reels.forEach((r, i) => {
      if (repaint) {
        paintReel(r.surface, time);
        r.texture.needsUpdate = true;
      }

      // Fade up 0.4 s apart as the chapter opens.
      const gate = THREE.MathUtils.clamp((t - 0.33 - i * 0.012) / 0.035, 0, 1);
      const out = 1 - THREE.MathUtils.clamp((t - 0.5) / 0.05, 0, 1);
      r.material.opacity += (gate * out * 0.94 - r.material.opacity) * 0.1;

      const mesh = meshes.current[i];
      if (!mesh) return;
      const a = time * 0.14 + (i / reels.length) * Math.PI * 2;
      mesh.position.set(Math.sin(a) * 2.2, 1.3 + Math.sin(time * 0.5 + i) * 0.06, Math.cos(a) * 2.2);

      // A PlaneGeometry's face is +Z, and lookAt aims +Z at the target, so aiming at a
      // point radially OUTWARD from the turntable axis puts the picture on the outside.
      // (An extra PI here flips the panel to face inward and renders every frame mirrored.)
      mesh.lookAt(
        stage.position[0] + mesh.position.x * 4,
        stage.position[1] + 1.3,
        stage.position[2] + mesh.position.z * 4,
      );
    });
  });

  return (
    <group ref={group} position={stage.position} visible={false}>
      {reels.map((r, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              if (el) meshes.current[i] = el;
            }}
            material={r.material}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(i);
            }}
          >
            <planeGeometry args={[1.6, 0.9]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export { REEL_SOURCES, REELS };
