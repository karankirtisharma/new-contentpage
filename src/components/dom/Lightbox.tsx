'use client';

import { useEffect } from 'react';
import { useSignal } from '@/lib/store';
import { REELS } from '../scene/StageMonitors';

/**
 * Reel lightbox — clicking a stage monitor opens it with sound (§6, stage row).
 * Until the real reels land (§12 open items) this shows the reel slate and states
 * plainly that the film is pending, rather than faking a player.
 */
export default function Lightbox() {
  const lightbox = useSignal((s) => s.lightbox);
  const setLightbox = useSignal((s) => s.setLightbox);
  const open = lightbox !== null;
  const reel = lightbox !== null ? REELS[lightbox % REELS.length] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLightbox]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm transition-opacity duration-400"
      style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      onClick={() => setLightbox(null)}
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      aria-label="Reel"
    >
      <div
        className="w-full max-w-[900px] border border-[rgba(125,255,160,0.2)] bg-[#070a09]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex aspect-video items-center justify-center border-b border-[rgba(125,255,160,0.14)] bg-[#04120b]">
          <div className="text-center">
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#7dffa0]">{reel?.code ?? ''}</p>
            <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-[#5d6f65]">
              REEL PENDING DELIVERY · {reel?.dur ?? '--:--'}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between px-6 py-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-[#5d6f65]">
            Drop files into /public/reels and set REEL_SOURCES to go live
          </p>
          <button className="ghost-btn" data-interactive onClick={() => setLightbox(null)}>
            Close ✕
          </button>
        </div>
      </div>
    </div>
  );
}
