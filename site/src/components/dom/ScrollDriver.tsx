'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { chapterFromT, scroll, useSignal } from '@/lib/store';

gsap.registerPlugin(ScrollTrigger);

/**
 * The single source of scroll truth — §8 of the plan.
 *
 * One clock: gsap.ticker drives Lenis (`autoRaf: false`), Lenis forwards to
 * ScrollTrigger, and exactly one scrubbed ScrollTrigger writes the normalised master
 * `t` into the non-reactive `scroll` channel. The R3F camera and the DOM timelines both
 * read from there, so nothing calls setState per frame.
 *
 * drei's ScrollControls was rejected because it owns its own scroll container, which
 * fights a normal DOM page, Lenis and SEO.
 */
export default function ScrollDriver({ children }: { children: React.ReactNode }) {
  const setChapter = useSignal((s) => s.setChapter);
  const reducedMotion = useSignal((s) => s.reducedMotion);

  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.08,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
      autoRaf: false,
      // Reduced motion: no smoothing, the browser's own scroll drives the page.
      smoothWheel: !reducedMotion,
    });

    // Under `frameloop="demand"` the canvas is asleep between events, so every input
    // that moves the world has to wake it. The rig keeps requesting frames from there
    // until its damping has settled.
    // The bridge is the existing non-reactive `scroll` channel rather than a global or a
    // React context: ScrollDriver lives in the DOM tree, outside the Canvas, so it has no
    // access to `useThree` — and this channel is already exactly the DOM-to-3D seam.
    const wake = () => scroll.invalidate?.();
    lenis.on('scroll', () => {
      ScrollTrigger.update();
      wake();
    });

    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    }

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    let lastChapter = -1;

    const st = ScrollTrigger.create({
      trigger: '#signal-scroll',
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        scroll.target = self.progress;
        const c = chapterFromT(self.progress);
        if (c !== lastChapter) {
          lastChapter = c;
          setChapter(c);
        }
      },
    });

    const onPointer = (e: PointerEvent) => {
      scroll.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      scroll.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      wake();
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    // Keyboard chapter stepping, §6 global row. Never blocks native scroll keys.
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      let dir = 0;
      if (e.key === 'PageDown') dir = 1;
      if (e.key === 'PageUp') dir = -1;
      if (!dir) return;
      e.preventDefault();
      const next = Math.min(5, Math.max(0, chapterFromT(scroll.target) + dir));
      const el = document.getElementById(`ch-${next}`);
      if (el) lenis.scrollTo(el, { offset: 0, duration: 1.1 });
    };
    window.addEventListener('keydown', onKey);

    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh).catch(() => {});
    window.addEventListener('resize', refresh);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', refresh);
      st.kill();
      lenis.destroy();
    };
  }, [setChapter, reducedMotion]);

  return <>{children}</>;
}
