'use client';

import { useEffect, useRef, useState } from 'react';
import { CHAPTERS } from '@/lib/chapters';
import { scroll, useSignal } from '@/lib/store';

/** Top bar — wordmark, chapter jump, CTA. §7. */
export function Nav() {
  const chapter = useSignal((s) => s.chapter);
  const entered = useSignal((s) => s.entered);

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 py-5 md:px-10 transition-opacity duration-1000"
      style={{ opacity: entered ? 1 : 0 }}
    >
      <a href="#top" className="flex items-center gap-3" data-interactive>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="8.2" fill="none" stroke="#7dffa0" strokeWidth="1" />
          <circle cx="10" cy="10" r="2.6" fill="#7dffa0" />
          <path d="M10 1.8 L10 5" stroke="#7dffa0" strokeWidth="1" />
        </svg>
        <span className="font-mono text-[11px] tracking-[0.22em] text-[#d6e8dd]">CYPHERNAUT</span>
      </a>

      <nav className="hidden items-center gap-7 md:flex" aria-label="Chapters">
        {CHAPTERS.slice(1, 5).map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            data-interactive
            className="font-mono text-[10px] tracking-[0.18em] transition-colors duration-300"
            style={{ color: chapter === c.index ? '#7dffa0' : '#5d6f65' }}
          >
            {c.label.split('—')[1]?.trim() ?? c.label}
          </a>
        ))}
      </nav>

      <a href="#engine" className="ghost-btn" data-interactive>
        Plug in
      </a>
    </header>
  );
}

/**
 * Progress rail — §7. Six ticks; the active one glows and the Signal pulse position
 * is mirrored on the rail so the DOM and the conduit read the same clock.
 */
export function ProgressRail() {
  const chapter = useSignal((s) => s.chapter);
  const entered = useSignal((s) => s.entered);
  const fill = useRef<HTMLDivElement>(null);
  const pulse = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (fill.current) fill.current.style.transform = `scaleY(${scroll.t})`;
      if (pulse.current) pulse.current.style.transform = `translateY(${scroll.t * 100}%)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 md:block transition-opacity duration-1000"
      style={{ opacity: entered ? 1 : 0 }}
      aria-hidden
    >
      <div className="relative h-[46vh] w-px bg-[rgba(125,255,160,0.14)]">
        <div
          ref={fill}
          className="absolute inset-x-0 top-0 h-full origin-top bg-[rgba(125,255,160,0.5)]"
          style={{ transform: 'scaleY(0)' }}
        />
        <div ref={pulse} className="absolute -left-[3px] top-0 h-2 w-[7px] -translate-y-1/2">
          <span className="block h-full w-full rounded-full bg-[#7dffa0] shadow-[0_0_12px_4px_rgba(125,255,160,0.5)]" />
        </div>

        {CHAPTERS.map((c, i) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            data-interactive
            className="absolute -left-[13px] flex h-6 w-7 items-center justify-end"
            style={{ top: `${(i / (CHAPTERS.length - 1)) * 100}%`, transform: 'translateY(-50%)' }}
            aria-label={c.label}
          >
            <span
              className="block h-px transition-all duration-500"
              style={{
                width: chapter === i ? 13 : 6,
                background: chapter === i ? '#7dffa0' : '#33453b',
              }}
            />
          </a>
        ))}
      </div>
      <p className="mt-4 -rotate-90 origin-top-left translate-x-3 font-mono text-[9px] tracking-[0.3em] text-[#3f5148]">
        SIGNAL
      </p>
    </div>
  );
}

/** Viewfinder-bracket cursor. Pointer-fine only; disabled under reduced motion. */
export function Cursor() {
  const el = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState(false);
  const reduced = useSignal((s) => s.reducedMotion);

  useEffect(() => {
    if (reduced) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.body.dataset.cursor = 'on';
    const pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const cur = { ...pos };

    const move = (e: PointerEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      const t = e.target as HTMLElement | null;
      setHot(Boolean(t?.closest('a,button,[data-interactive]')));
    };

    let raf = 0;
    const tick = () => {
      cur.x += (pos.x - cur.x) * 0.22;
      cur.y += (pos.y - cur.y) * 0.22;
      if (el.current) el.current.style.transform = `translate3d(${cur.x - 17}px, ${cur.y - 17}px, 0)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', move, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
      delete document.body.dataset.cursor;
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div ref={el} className="viewfinder" data-hot={hot} aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <span className="dot" />
    </div>
  );
}

/** Scroll affordance under the hero. */
export function ScrollHint() {
  const entered = useSignal((s) => s.entered);
  const chapter = useSignal((s) => s.chapter);
  const visible = entered && chapter === 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-8 z-30 flex flex-col items-center gap-3 transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden
    >
      <span className="font-mono text-[9px] tracking-[0.3em] text-[#4d6157]">SCROLL</span>
      <span className="relative block h-9 w-px overflow-hidden bg-[rgba(125,255,160,0.16)]">
        <span className="absolute inset-x-0 h-3 animate-[railpulse_2.2s_ease-in-out_infinite] bg-[#7dffa0]" />
      </span>
      <style>{`@keyframes railpulse{0%{top:-40%}100%{top:110%}}`}</style>
    </div>
  );
}
