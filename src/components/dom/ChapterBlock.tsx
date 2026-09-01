'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CHAPTERS,
  COUNTERS,
  COUNTERS_ARE_ILLUSTRATIVE,
  ENGINE_STAGES,
  totalBullets,
  type Chapter,
} from '@/lib/chapters';
import { useSignal } from '@/lib/store';

/**
 * Scroll geometry.
 *
 * Each section's height is its share of the master `t`, so a chapter's copy is on screen
 * for exactly as long as its camera beat plays.
 *
 * The half-viewport pads matter. Scroll progress is measured against the *scrollable*
 * range (docH - vh), while a sticky block is centred when the viewport CENTRE is inside
 * its section — and the centre leads the scroll position by vh/2. Sizing sections
 * against the full document height instead put every copy window half a viewport ahead
 * of its own chapter: chapter 1's camera hold at t = 0.28 landed at 0.278, just past the
 * end of its copy window, so the dolly parked on the drafting table while the drafting
 * table's copy was already sliding away.
 *
 * Padding both ends by vh/2 and sizing the sections against the scrollable range makes
 * the copy-centred window exactly equal to the chapter's `t` range:
 *
 *   centre = scrollY + vh/2, section spans [vh/2 + a·S, vh/2 + b·S] where S = docH - vh
 *   => centred while scrollY/S ∈ [a, b] = the chapter range, exactly.
 */
const SCROLL_VH = 900;
const EDGE_PAD_VH = 50;

function sectionHeight(chapter: Chapter) {
  return `${(chapter.range[1] - chapter.range[0]) * SCROLL_VH}vh`;
}

/** Half-viewport pad so the viewport centre starts and ends on a section boundary. */
export function ScrollPad() {
  return <div aria-hidden style={{ height: `${EDGE_PAD_VH}vh` }} />;
}

/**
 * A chapter's scroll geometry with none of its copy — what runs while SHOW_COPY is off.
 *
 * The camera timeline is driven by document height, so these sections have to stay
 * mounted even when their words do not: drop them and the scrollable range collapses,
 * `t` never leaves 0, and the dolly sits parked on the first beat. Same id, same height,
 * nothing rendered inside.
 */
export function ChapterSpacer({ chapter }: { chapter: Chapter }) {
  return <section id={chapter.id} aria-hidden style={{ height: sectionHeight(chapter) }} />;
}

/**
 * Splits a headline on newlines so each line can clip-reveal independently.
 *
 * `as` keeps the document to one h1 (the hero) with every chapter an h2. §7 asks for a
 * real heading hierarchy, and since the canvas is aria-hidden these headings are the
 * only structure a screen reader or a crawler gets.
 */
function Headline({
  text,
  shown,
  as: Tag = 'h2',
}: {
  text: string;
  shown: boolean;
  as?: 'h1' | 'h2';
}) {
  return (
    <Tag className="headline" data-shown={shown}>
      {text.split('\n').map((line, i) => (
        <span key={i} className="reveal-line">
          <span style={{ transitionDelay: `${i * 90}ms` }}>{line}</span>
        </span>
      ))}
    </Tag>
  );
}

/** Observes its own section so reveals fire on entry and reverse cleanly on exit. */
function useShown<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Tall sections never reach a high intersection ratio, so fire on any overlap
    // with the middle band of the viewport instead.
    const io = new IntersectionObserver(([e]) => setShown(e.isIntersecting), {
      rootMargin: '-35% 0px -35% 0px',
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

export function HeroBlock() {
  const chapter = CHAPTERS[0];
  const entered = useSignal((s) => s.entered);

  return (
    <section
      id={chapter.id}
      className="scrim relative px-6 md:px-16 lg:px-24"
      style={{ height: sectionHeight(chapter) }}
      data-shown={entered}
    >
      <div className="sticky top-[104px] max-w-[54rem] md:top-1/2 md:-translate-y-1/2">
        <p className="label reveal-fade" style={{ transitionDelay: '120ms' }}>
          {chapter.label}
        </p>
        <div className="mt-6">
          <Headline as="h1" text={chapter.headline} shown={entered} />
        </div>
        <p className="lede reveal-fade mt-7" style={{ transitionDelay: '520ms' }}>
          {chapter.lede}
        </p>
        <div className="reveal-fade mt-10 flex flex-wrap items-center gap-5" style={{ transitionDelay: '680ms' }}>
          <a href="#engine" className="cta" data-interactive>
            Plug into the engine
          </a>
          <a href="#direct" className="cta cta--ghost" data-interactive>
            See the line
          </a>
        </div>
      </div>
    </section>
  );
}

export function ChapterBlock({ chapter }: { chapter: Chapter }) {
  const { ref, shown } = useShown<HTMLElement>();
  const setDrawer = useSignal((s) => s.setDrawer);
  const n = totalBullets(chapter);
  // Which side the copy sits on has to agree with where the CAMERA puts its subject,
  // or the machine ends up behind the words. Chapters 1 and 3 are the beats whose holds
  // frame their station to frame-LEFT (the table's over-the-shoulder, the machine row's
  // three-quarter), so those are the chapters whose copy moves right. Chapters 2 and 4
  // hold their subject centre or right, and read better with the copy on the left.
  const right = chapter.index === 1 || chapter.index === 3;

  return (
    <section
      ref={ref}
      id={chapter.id}
      className={`scrim ${right ? 'scrim--right' : ''} relative px-6 md:px-16 lg:px-24`}
      style={{ height: sectionHeight(chapter) }}
      data-shown={shown}
      aria-labelledby={`${chapter.id}-h`}
    >
      {/* Sticky, not ScrollTrigger-pinned: the copy holds through its own chapter
          while the camera dollies, and sticky survives Lenis and resize without
          the pin-spacer that ScrollTrigger would inject into the scroll length. */}
      <div
        className={`sticky top-[104px] w-full max-w-[40rem] md:top-1/2 md:-translate-y-1/2 ${
          right ? 'md:ml-auto' : ''
        }`}
      >
        <p className="label reveal-fade">{chapter.label}</p>

        <div className="mt-3 md:mt-5" id={`${chapter.id}-h`}>
          <Headline text={chapter.headline} shown={shown} />
        </div>

        <p className="lede reveal-fade mt-4 md:mt-6" style={{ transitionDelay: '340ms' }}>
          {chapter.lede}
        </p>

        <ul className="mt-6 flex flex-wrap gap-1.5 md:mt-9 md:gap-2">
          {chapter.chips.map((chip, i) => (
            <li key={chip}>
              <span className="chip block" style={{ transitionDelay: `${480 + i * 55}ms` }}>
                {chip}
              </span>
            </li>
          ))}
        </ul>

        {chapter.index === 4 && <Counters shown={shown} />}

        <div className="reveal-fade mt-6 md:mt-9" style={{ transitionDelay: '900ms' }}>
          <button className="ghost-btn" data-interactive onClick={() => setDrawer(chapter.index)}>
            See all {n} →
          </button>
        </div>
      </div>
    </section>
  );
}

function Counters({ shown }: { shown: boolean }) {
  const [vals, setVals] = useState(COUNTERS.map(() => 0));

  useEffect(() => {
    if (!shown) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1600);
      const e = 1 - Math.pow(1 - p, 3);
      setVals(COUNTERS.map((c) => Math.round(c.value * e)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  return (
    <>
    <dl className="reveal-fade mt-10 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4" style={{ transitionDelay: '760ms' }}>
      {COUNTERS.map((c, i) => (
        <div key={c.label}>
          <dt className="sr-only">{c.label}</dt>
          <dd className="font-mono text-[1.9rem] font-light leading-none text-[#7dffa0]">
            {vals[i]}
            <span className="text-[1.1rem]">{c.suffix}</span>
          </dd>
          <p className="mt-2 font-mono text-[9.5px] uppercase leading-tight tracking-[0.13em] text-[#5d6f65]">
            {c.label}
          </p>
        </div>
      ))}
    </dl>
    {COUNTERS_ARE_ILLUSTRATIVE && (
      <p className="reveal-fade mt-4 font-mono text-[9px] tracking-[0.12em] text-[#455a4f]" style={{ transitionDelay: '820ms' }}>
        FIGURES ILLUSTRATIVE — REPLACED WITH CLIENT DATA AT LAUNCH
      </p>
    )}
    </>
  );
}

export function EngineBlock() {
  const { ref, shown } = useShown<HTMLElement>();
  const chapter = CHAPTERS[5];

  return (
    <section
      ref={ref}
      id={chapter.id}
      className="scrim scrim--center relative px-6 text-center md:px-16"
      style={{ height: sectionHeight(chapter) }}
      data-shown={shown}
    >
      <div className="sticky top-[104px] mx-auto max-w-[62rem] md:top-1/2 md:-translate-y-1/2">
        {/* The visible headline here is the engine sentence, which is semantically an
            ordered list of stages — so the chapter label carries the section's h2 and
            the outline has no gap. */}
        <h2 className="label reveal-fade">{chapter.label}</h2>

        <ol className="reveal-fade mx-auto mt-10 flex max-w-[46rem] flex-wrap items-center justify-center gap-x-2 gap-y-3">
          {ENGINE_STAGES.map((stage, i) => (
            <li key={stage} className="flex items-center gap-2">
              <span
                className="font-sans text-[clamp(1rem,2.3vw,1.6rem)] font-light tracking-tight text-[#e8f2ec] transition-all duration-700"
                style={{
                  transitionDelay: `${i * 85}ms`,
                  opacity: shown ? 1 : 0,
                  filter: shown ? 'none' : 'blur(8px)',
                }}
              >
                {stage}
              </span>
              {i < ENGINE_STAGES.length - 1 && (
                <span
                  className="block h-px w-4 bg-[#7dffa0] transition-all duration-700"
                  style={{ transitionDelay: `${i * 85 + 40}ms`, opacity: shown ? 0.5 : 0 }}
                />
              )}
            </li>
          ))}
        </ol>

        <p className="lede reveal-fade mx-auto mt-10 text-center" style={{ transitionDelay: '900ms' }}>
          {chapter.lede}
        </p>

        <div className="reveal-fade mt-12 flex flex-wrap items-center justify-center gap-5" style={{ transitionDelay: '1050ms' }}>
          <a href="mailto:hello@cyphernaut.io" className="cta" data-interactive>
            Plug into the engine
          </a>
          <a href="#direct" className="cta cta--ghost" data-interactive>
            Run it back
          </a>
        </div>

        <p className="reveal-fade mt-16 font-mono text-[10px] tracking-[0.2em] text-[#3f5148]" style={{ transitionDelay: '1200ms' }}>
          CYPHERNAUT · CONTENT CREATION &amp; MEDIA PRODUCTION
        </p>
      </div>
    </section>
  );
}
