'use client';

/**
 * No-WebGL / very-low-end backdrop — §7.
 *
 * The full DOM layer still renders on top of this; only the canvas is replaced.
 * A CSS-only version of the same world: void, survey grid, one green horizon glow
 * and the Signal running down the page.
 */
export default function Fallback() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#050607]" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 108%, rgba(125,255,160,0.16) 0%, rgba(125,255,160,0.04) 35%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[62%]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(125,255,160,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(125,255,160,0.10) 1px, transparent 1px)',
          backgroundSize: '68px 68px',
          transform: 'perspective(320px) rotateX(62deg)',
          transformOrigin: 'bottom',
          maskImage: 'linear-gradient(transparent, #000 45%, #000)',
        }}
      />
      <div
        className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2"
        style={{ background: 'linear-gradient(transparent, rgba(125,255,160,0.28), transparent)' }}
      />
    </div>
  );
}
