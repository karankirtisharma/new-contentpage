'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { CHAPTERS } from '@/lib/chapters';
import { useSignal } from '@/lib/store';
import { detectTier, prefersReducedMotion } from '@/lib/tier';
import ScrollDriver from './dom/ScrollDriver';
import Loader from './dom/Loader';
import Drawer from './dom/Drawer';
import Lightbox from './dom/Lightbox';
import { Cursor, Nav, ProgressRail, ScrollHint } from './dom/Chrome';
import { ChapterBlock, ChapterSpacer, EngineBlock, HeroBlock, ScrollPad } from './dom/ChapterBlock';
import Fallback from './dom/Fallback';
import { SHOW_COPY } from '@/lib/flags';

// The canvas is client-only: no SSR, and it never blocks the DOM layer from painting.
const Scene = dynamic(() => import('./scene/Scene'), { ssr: false });

export default function SignalLine() {
  const tier = useSignal((s) => s.tier);
  const setTier = useSignal((s) => s.setTier);
  const setReducedMotion = useSignal((s) => s.setReducedMotion);
  const setLoaded = useSignal((s) => s.setLoaded);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __store?: typeof useSignal }).__store = useSignal;
    }

    const detected = detectTier();
    const reduced = prefersReducedMotion();
    setTier(detected);
    setReducedMotion(reduced);
    setDebugFromQuery();

    // Nothing to wait for when there is no canvas.
    if (detected === 'fallback') setLoaded(true);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setTier, setReducedMotion, setLoaded]);

  return (
    <>
      <Loader />
      {tier !== 'fallback' && <Scene />}
      {tier === 'fallback' && <Fallback />}

      <ScrollDriver>
        <div id="signal-scroll" className="dom-layer">
          {SHOW_COPY && (
            <>
              <Nav />
              <ProgressRail />
              <ScrollHint />
              <Cursor />
            </>
          )}

          <main id="top">
            <ScrollPad />
            {SHOW_COPY ? (
              <>
                <HeroBlock />
                {CHAPTERS.slice(1, 5).map((c) => (
                  <ChapterBlock key={c.id} chapter={c} />
                ))}
                <EngineBlock />
              </>
            ) : (
              // Geometry only. The scroll length is the camera's timeline, so it survives
              // the copy being switched off.
              CHAPTERS.map((c) => <ChapterSpacer key={c.id} chapter={c} />)
            )}
            <ScrollPad />
          </main>
        </div>
      </ScrollDriver>

      {SHOW_COPY && (
        <>
          <Drawer />
          <Lightbox />
        </>
      )}
    </>
  );
}

function setDebugFromQuery() {
  const debug = new URLSearchParams(window.location.search).get('debug') === '1';
  useSignal.getState().setDebug(debug);
}
