# Cyphernaut — Content & Media Production

A scroll-driven WebGL page. The visitor travels a 240-unit lunar corridor past six
machines, one per chapter, and the copy is pinned to the camera's position on that
journey rather than to the page.

The app is in [`site/`](site). Everything else at this level is the spec it was built
against.

```bash
cd site
npm install
npm run dev            # http://localhost:3000
```

`?debug=1` draws the camera splines, the Signal path and a bounding box per station, and
publishes `__three` / `__scroll` / `__post` on `window` for measuring things from the
console. `?debug=1&orbit=1` hands the camera to OrbitControls and adds `__pose()`, which
prints the current pose as a paste-ready beat. `?tier=laptop|mobile|fallback` forces a
quality tier.

## What is here

| | |
|---|---|
| [`site/`](site) | The Next.js + React Three Fiber app |
| [`site/BUILD-NOTES.md`](site/BUILD-NOTES.md) | **Where the build departs from the plan, and why.** The traps, the measurements, the things that looked right in source and did nothing on the GPU |
| [`MASTER-OVERHAUL.md`](MASTER-OVERHAUL.md) | The implementation spec: research digest, visual blueprint, tier matrix, twelve phases with gates |
| [`CREATIVE-BRIEF.md`](CREATIVE-BRIEF.md) | The art direction the overhaul answers to |
| [`content-page-3d-plan.md`](content-page-3d-plan.md) | The original plan, kept for the record |
| `emissive.py`, `glb_report.json` | Asset audit for the six source models |
| `*_sheet.jpg` | Reference sheets |

## How it fits together

The scroll pipeline is a single clock: `gsap.ticker` drives Lenis (`autoRaf: false`),
which drives ScrollTrigger, which writes one non-reactive `scroll` channel that every
system reads. Nothing else owns a rAF loop, and no per-frame value goes through React
state.

Four ideas carry most of the look:

- **One height field, four consumers.** `lib/terrain.ts` is the single answer to "how high
  is the ground at (x, z)". The terrain mesh IS that function sampled on a grid; the
  boulders bed into it, the machines are seated on it, and the camera is grounded against
  it. They cannot disagree.
- **Camera beats are computed, not typed.** `lib/world.ts` states shots as intent — "a
  three-quarter of the rig, filling a third of the frame, subject right" — and
  `lib/cameraPath.ts` resolves the heights against the terrain. See BUILD-NOTES §13–15.
- **Fog is a material chunk, not `scene.fog`.** Height fog with per-channel extinction and
  a moon-directional in-scatter term, patched into every lit material before tone mapping.
  Green comes from looking toward the moon; turn away and the air goes grey.
- **Tone mapping happens once, at the end.** The renderer maps nothing; the composer runs
  AgX last over HalfFloat buffers, so a bloom threshold of 1.0 selects actual light
  sources instead of any bright surface.

## Generated textures

`site/public/textures/*.png` are committed so a clone renders immediately. They are
deterministic output — `npm run gen:textures` rebuilds them from
[`site/scripts/gen-textures.mjs`](site/scripts/gen-textures.mjs), which contains its own
PNG encoder rather than pulling an image library.

## Known gaps

- **KTX2 compression is not applied.** It needs KTX-Software's `toktx` binary installed at
  system level. The GLBs are 12 MB on disk (already WebP-in-GLB), but they decompress to
  considerably more in VRAM, which is the real cost.
- **Performance has only been measured in dev**, where React StrictMode double-renders.
  The budgets in `MASTER-OVERHAUL.md` Part 7 want a production build in a real browser.
- `moon_albedo.png`, `moon_normal.png` and `planet_albedo.png` are left over from earlier
  passes of the sky and are no longer loaded.
