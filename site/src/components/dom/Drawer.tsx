'use client';

import { useEffect } from 'react';
import { CHAPTERS, totalBullets } from '@/lib/chapters';
import { useSignal } from '@/lib/store';

/**
 * The complete bullet list for a chapter — §3.1 and §7.
 *
 * Every one of the ~250 service bullets lives here, in the DOM at all times, so the
 * page is complete for search and screen readers without putting the list on the
 * canvas. The drawer only controls visibility; it never mounts or unmounts the content.
 */
export default function Drawer() {
  const drawer = useSignal((s) => s.drawer);
  const setDrawer = useSignal((s) => s.setDrawer);
  const open = drawer !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDrawer]);

  useEffect(() => {
    // Parallax and scroll both pause while the drawer is up.
    document.documentElement.classList.toggle('lenis-stopped', open);
    return () => document.documentElement.classList.remove('lenis-stopped');
  }, [open]);

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px] transition-opacity duration-500"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
        onClick={() => setDrawer(null)}
        aria-hidden
      />

      {CHAPTERS.filter((c) => c.groups.length > 0).map((chapter) => {
        const isOpen = drawer === chapter.index;
        return (
          <aside
            key={chapter.id}
            id={`drawer-${chapter.id}`}
            className="fixed right-0 top-0 z-[70] flex h-full w-full max-w-[640px] flex-col border-l border-[rgba(125,255,160,0.14)] bg-[#070a09] transition-transform duration-[700ms]"
            style={{
              transform: isOpen ? 'translateX(0)' : 'translateX(101%)',
              transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
              // Kept in the DOM always for SEO; hidden from AT only while closed.
              visibility: 'visible',
            }}
            aria-hidden={!isOpen}
            aria-label={`${chapter.label} — full capability list`}
          >
            <div className="flex items-start justify-between border-b border-[rgba(125,255,160,0.12)] px-8 py-7">
              <div>
                <p className="label">{chapter.label}</p>
                <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-[#5d6f65]">
                  {totalBullets(chapter)} CAPABILITIES · {chapter.groups.length} SERVICE AREAS
                </p>
              </div>
              <button
                className="ghost-btn shrink-0"
                data-interactive
                onClick={() => setDrawer(null)}
                tabIndex={isOpen ? 0 : -1}
              >
                Close ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8">
              {chapter.groups.map((group) => (
                <section key={group.ref} className="mb-11 last:mb-0">
                  <h3 className="flex items-baseline gap-3">
                    <span className="font-mono text-[10px] tracking-[0.14em] text-[#7dffa0]">{group.ref}</span>
                    <span className="font-sans text-[1.05rem] font-normal tracking-tight text-[#e8f2ec]">
                      {group.title}
                    </span>
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-3 text-[0.9rem] leading-relaxed text-[#9db0a5]">
                        <span className="mt-[0.62em] block h-px w-3 shrink-0 bg-[rgba(125,255,160,0.4)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </aside>
        );
      })}
    </>
  );
}
