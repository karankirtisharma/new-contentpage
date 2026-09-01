'use client';

import { useEffect, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { useSignal } from '@/lib/store';

/**
 * Aperture-iris loader — §7.
 *
 * Twelve SVG blades over a real byte-progress ring (drei useProgress). On completion
 * the blades open outward and the whole overlay lifts, revealing the lens looking
 * back at the viewer. This is the page's first gesture, so it is a camera gesture.
 */
export default function Loader() {
  const { progress, item } = useProgress();
  const loaded = useSignal((s) => s.loaded);
  const setEntered = useSignal((s) => s.setEntered);
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const shown = useRef(0);
  const [display, setDisplay] = useState(0);

  // Ease the number so it never snaps from 0 to 100 on a warm cache. The scene's own
  // readiness wins over the loading manager's figure, which can under-report when a
  // loader supplies its own manager.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // Creep toward 92% on elapsed time so the ring always moves, then let real
      // progress or actual readiness take it home.
      const creep = Math.min(92, ((now - start) / 3200) * 92);
      const target = loaded ? 100 : Math.max(progress, creep);
      shown.current += (target - shown.current) * 0.08;
      setDisplay(shown.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progress, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const a = setTimeout(() => setOpen(true), 260);
    const b = setTimeout(() => {
      setGone(true);
      setEntered(true);
      document.documentElement.classList.remove('lenis-stopped');
    }, 1900);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [loaded, setEntered]);

  if (gone) return null;

  const R = 78;
  const C = 2 * Math.PI * R;
  const pct = Math.min(100, Math.max(0, display));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050607] transition-opacity duration-[900ms]"
      style={{ opacity: open ? 0 : 1, pointerEvents: open ? 'none' : 'auto' }}
      aria-live="polite"
      aria-busy={!loaded}
    >
      <svg width="260" height="260" viewBox="-130 -130 260 260" className="overflow-visible">
        <defs>
          <radialGradient id="irisGlow">
            <stop offset="0%" stopColor="#7dffa0" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#7dffa0" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle r="98" fill="url(#irisGlow)" style={{ opacity: open ? 1 : 0.35, transition: 'opacity 1s' }} />

        {/* progress ring */}
        <circle r={R} fill="none" stroke="rgba(125,255,160,0.14)" strokeWidth="1" />
        <circle
          r={R}
          fill="none"
          stroke="#7dffa0"
          strokeWidth="1.5"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          transform="rotate(-90)"
          style={{ transition: 'stroke-dashoffset 0.2s linear' }}
        />

        {/* iris blades */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * 360;
          return (
            <g key={i} transform={`rotate(${a})`}>
              <path
                d="M -30 -6 L 30 -6 L 12 -66 L -12 -66 Z"
                fill="#0b1410"
                stroke="rgba(125,255,160,0.30)"
                strokeWidth="0.75"
                style={{
                  transform: open ? 'translateY(-78px) scale(1.25)' : 'translateY(0) scale(1)',
                  transformOrigin: 'center',
                  transition: `transform 1.05s cubic-bezier(0.16,1,0.3,1) ${i * 22}ms, opacity .7s ease ${i * 18}ms`,
                  opacity: open ? 0 : 1,
                }}
              />
            </g>
          );
        })}

        <text
          textAnchor="middle"
          y="6"
          fill="#7dffa0"
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 20,
            letterSpacing: '0.1em',
            opacity: open ? 0 : 1,
            transition: 'opacity .4s',
          }}
        >
          {String(Math.round(pct)).padStart(3, '0')}
        </text>
      </svg>

      <div
        className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 text-center"
        style={{ opacity: open ? 0 : 1, transition: 'opacity .5s' }}
      >
        <p className="label">Cyphernaut · Content Engine</p>
        <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-[#4b5c52] truncate max-w-[70vw]">
          {loaded ? 'CALIBRATING LENS' : (item || 'LOADING SIGNAL').replace(/^.*\//, '')}
        </p>
      </div>
    </div>
  );
}
