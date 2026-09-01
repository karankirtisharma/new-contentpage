# MASTER OVERHAUL — "The Signal Line" → AAA Cinematic World

**This is the single implementation document.** It merges the creative brief ("AAA Environment
Overhaul" prompt), a full audit of the existing codebase, and technique research into one
buildable spec. It is written to be executed by a fresh Claude Opus 5 session with no other
context. Read it top to bottom before touching a file.

- Project root: `D:\Claude\contentpageMD` (assets, original plan, this file)
- App: `D:\Claude\contentpageMD\site` (Next.js 16 · React Three Fiber v9 · three ~0.185)
- Dev: `cd site && npm run dev` → http://localhost:3000
- Verify gates: `npx tsc --noEmit` · `npx eslint src --max-warnings=0` · `npm run build`

**How to execute this document (for the implementing agent):**
1. Read this file fully. Then read `CREATIVE-BRIEF.md` (the 40-section creative brief
   this doc implements — Part 6 Phase 11 runs its §38 question list), then
   `site/BUILD-NOTES.md`, then skim `content-page-3d-plan.md` §1–§6 for asset context. Then read the source files in the
   Part 1E order before editing any of them.
2. Work in the Part 6 phase order. Never start a phase before the previous phase's gate
   passes. Run the three verify gates at every phase end.
3. Make strong decisions inside the guardrails here; where this doc gives numbers they
   are STARTING values to tune in the browser, except Hard Rules (5C) and Traps (1D),
   which are binding.
4. All screenshots/fps claims must come from a real browser — the in-IDE preview
   throttles rAF (Trap #10).
5. Update `BUILD-NOTES.md` at the end (Phase 12) with what actually shipped, deviations
   included — that file is the project's memory.

---

## PART 0 — VERDICT ON THE CREATIVE BRIEF

The brief is ~85% valid and unusually good. It is adopted as the creative direction with the
following **binding corrections**, each grounded in facts about this specific codebase and
platform. Where the brief and this section disagree, this section wins.

| # | Brief says | Reality | Ruling |
|---|---|---|---|
| 1 | "Inspect GLBs, use per-part choreography where useful" | Every Tripo mesh is a patchwork of **1,300+ disconnected micro-islands**. No part can be isolated (this already killed a procedural iris feature — see §Traps). | All choreography is whole-object + camera + light. Per-part motion requires Tripo Part Segmentation (out of scope; listed in Open Items). |
| 2 | "Research tessellation-class detail" | **The web has no tessellation or geometry shaders** (WebGL2 lacks them; WebGPU deliberately omitted them). | Detail = pre-subdivided grids + vertex displacement + normal maps. Nothing else exists. |
| 3 | Implies heavyweight volumetrics, SSR, GTAO, dynamic cubemaps are candidates | pmndrs postprocessing is **WebGL-only**; budget is 400k tris / <60 draw calls / DPR ≤1.5 at 60fps. | Tiered fog system (Part 3F), env-map-first reflections, N8AO on desktop only, zero per-frame cubemaps. Every effect has a tier row in Part 5. |
| 4 | "Forget the current look; redesign freely" | The DOM/copy layer (234 SSR'd bullets, heading outline, drawers, scrims, reduced-motion, tiers) is **SEO/a11y infrastructure**, not look. | Visual layer: redesign freely. DOM/content/scroll-pipeline architecture: keep (Part 1B lists exactly what survives). |
| 5 | "No visible signal line" | Current build has a literal glowing TubeGeometry conduit. | **Adopted.** The tube is deleted and replaced by hidden infrastructure (Part 3G). This is the largest deliberate reversal of the original plan's locked motif — owner's decision, recorded here. |
| 6 | "Implement now" (§40) | The user's wrapper instruction overrides: produce this MD for a fresh Opus 5 session to implement. | This document IS the deliverable. Its Part 6 is the implementation order. |
| 7 | Silent on real, verified bugs | This codebase already ate four days of a previous session via silent failure modes. | The Traps section (Part 1D) is **mandatory reading**; several will reproduce during this overhaul if ignored. |
| 8 | §9 journey grammar starts with fog-entry before the first discovery | The hero establish shot must sell the world (moon, ridge, scale) in clear air, and the DOM title sits over it. | Discovery #1 (the rig) plays in the clearest air of the piece; the full enter-atmosphere→collapse→discovery grammar begins with discovery #2 (the table). Deliberate reorder of a brief section that calls itself "foundation, not hard requirement". |
| 9 | §10: booth gets a "tighter lens" | The booth is the fly-through gate; widening THROUGH the crossing (46→52) sells speed at the frame edges. | Approach is the tight lens (46 after a 44 pre-beat); the widen is the crossing itself. Deliberate reversal, recorded here. |

The brief's quality bar is adopted verbatim as the acceptance test:

> At any random scroll position, with all text/UI removed, the frame must read as a frame
> from a high-budget science-fiction game cinematic — not a Three.js demo, not six GLBs on
> a plane.

---

## PART 1 — GROUND TRUTH (audit of what exists)

### 1A · The six hero assets

Source: direct GLB inspection + `glb_report.json` + original plan §1. All six live in
`site/public/models/*.glb` (~150k tris, ~2MB each; 951k tris / 11.7MB total). All are
1-unit-normalized bboxes, base at y=0, no baked rotations. Basecolor 2K WebP; the shipped
normal maps are **flat noise** and the RM maps are **per-island garbage** — both are stripped
at load and replaced with constants (rough 0.45 / metal 0.10) by `lib/materials.ts`, which
also derives the emissive mask in-shader (green-dominant + bright-white pixels → acid green).

| File | Identity | Dims (W×H×D) | Emissive cal. | Cinematic notes |
|---|---|---|---|---|
| `camera_rig_web.glb` | Large-format cinema camera on rail base; lens barrel at **+X end**, bellows frames, slates | 0.98×0.42×0.66 | 1.3 | Hero. −31° yaw aims lens at viewer while keeping 3/4 silhouette. Dead-on (−90°) foreshortens it into a disc. Iconic from every angle. |
| `sci-fi_control_table_web.glb` | Tilted drafting/light table + **fully-sculpted Cyphernaut figure** standing at it | 0.98×0.52×0.85 | 2.6 | Best geometry + only good figure in the set. The character anchor. Low tracking shots across the lit surface; over-the-shoulder holds. |
| `futuristic_control_ring_web.glb` | Circular turntable stage under lit canopy ring, two robot camera arms, console | 0.98×0.65×0.98 | 0.5 (turntable disc masked via local-Y gate) | It IS a turntable — rotates 0.15 rad/s. Pale canopy blooms easily; keep emissive low. Frontal symmetric push-in works. |
| `green_technical_device_web.glb` | Vertical gantry booth: boom camera, teleprompter, side light panels | 0.62×0.98×0.63 | 0.55 | Only portrait-format asset. Built to be flown THROUGH (camera crosses its plane; panels flash on crossing). 18.9% of texture is lit panel — runs hot. |
| `futuristic_machinery_web.glb` | Flat rig: hub cube fanning cables to a row of lit panels on a rail | 0.98×0.28×0.98 | 0.9 (+ `uSeq` hub→panel ignition gradient along local X) | "One source → many outputs." Lateral dolly along the panel row; sequential ignition already implemented as a shader uniform. |
| `sci-fi_prop_web.glb` | Tilted concentric-ring dish/orrery on pedestal, node beads, 3-spoke core | 0.98×0.91×0.97 | 0.6 | Best-looking station under bloom. Y-spin reads as radar sweep (dish is tilted). Scroll-velocity accelerates spin. |

Four further GLBs exist in the project root but were **excluded** (duplicates / melted
figures): `futuristic_control_desk`, `futuristic_space_station`, `futuristic_control_table`,
`sci-fi_control_console`. Do not add them.

### 1B · Architecture that SURVIVES the overhaul (do not rebuild these)

These systems are sound, bug-fixed, and hard-won. Reuse them.

| System | Where | Why it survives |
|---|---|---|
| Single-clock scroll pipeline | `dom/ScrollDriver.tsx` | gsap.ticker → Lenis (`autoRaf:false`) → ScrollTrigger → writes normalized `t` into a **non-reactive** channel. Zero per-frame React state. Keyboard chapter stepping, font/resize refresh, reduced-motion aware. |
| Per-frame channel | `lib/store.ts` (`scroll` object) | `{target, t, velocity, speed, pointer, parallax, look}` — mutated by the driver, read by `useFrame` consumers. The camera publishes its live look target here; the light rig and floor read it. Extend it; don't replace it. |
| Camera beat system | `lib/world.ts` (`CAMERA_KEYS`) + `scene/CameraRig.tsx` | Data-driven beats `{t, pos, look, fov, hold}`; two CatmullRom splines sampled in **index space** (`getPoint`, never `getPointAt` — beats are narrative-spaced, not distance-spaced); per-segment hold easing with the invariant `remapHold(k.t) === k.t`; per-key FOV lerp; portrait-aspect dolly-back compensation; parallax + hold-orbit with authority only while parked. This is already the brief's §8 "cinematic keyframe system". The overhaul EXTENDS the beat type (roll, fog, exposure, dof) and re-authors the beats — it does not rewrite the sampler. |
| Derived-emissive material patch | `lib/materials.ts` | onBeforeCompile injection; strips dead maps; per-station uniforms `uStrength/uBoost/uSeq/uFloorMask` drive breathing/flash/ignition for free. Fog work must compose with this patch (chunk ordering — see Traps). |
| Quality tiers | `lib/tier.ts` | Width-first device probe (touch-laptops not mis-tiered), `?tier=` override, per-tier config consumed by the scene. Extend the config type with the new systems' flags. |
| Station lifecycle | `scene/Station.tsx` | Visibility windows (±1 chapter), finale override, per-station idle motions on refs/uniforms only. Never disposes; re-entry costs nothing. |
| DOM/editorial layer | `dom/ChapterBlock.tsx`, `Drawer.tsx`, `Chrome.tsx`, `globals.css` | 1×h1/5×h2/18×h3 outline; 18 service groups / **191 drawer bullets** permanently in the DOM (234 SSR list items total incl. chips/stages); scrims; chips; progress rail; viewfinder cursor; counters (labelled illustrative). The brief's §27 editorial UI already exists here. Note: the bullets are FIRST-DRAFT copy written from area titles — content review is an open item, not part of this overhaul. |
| Scroll geometry maths | `dom/ChapterBlock.tsx` | Sections sized against the **scrollable** range with half-viewport `ScrollPad`s so each chapter's copy-centred window equals its `t` range EXACTLY (verified numerically). Any change to chapter ranges must preserve this. |
| Deterministic dust seeding | `scene/Atmosphere.tsx` (`makeRng`) | mulberry32; scene is reproducible for visual QA. Reuse for rock/terrain scatter. |
| Debug rig | `scene/Debug.tsx` | `?debug=1` splines/bounds; `?debug=1&orbit=1` hand-flies camera; `__pose()` prints paste-ready beat rows. Dev handles: `__scroll`, `__store`, `__lenis`, `__signal`, `__at(p)`. Essential for authoring the new beats. |
| Readiness gating | `scene/Scene.tsx` (`ReadySignal`) | Suspense-mounted (deterministic), pre-compiles shaders before the loader lifts. |

### 1C · What the overhaul REPLACES

| Current | Replacement (spec in Part 3) |
|---|---|
| `scene/Floor.tsx` — flat 110×110 shader plane w/ grid, pools, scan bar | Corridor terrain: displaced grid + station pads + instanced rocks + distant ridge silhouettes. The grid look dies entirely (brief §2: "generic procedural grid"). |
| `scene/SignalConduit.tsx` — glowing TubeGeometry along the whole line | DELETED **in Phase 7, not before**: `CONDUIT_POINTS` and `STATIONS[].port` must survive until then (SignalConduit.tsx AND Debug.tsx import them — dropping the export earlier fails `tsc` at a phase gate). Replaced by hidden infrastructure: buried seam in terrain shader + node pucks + cable props + distant beacons + machine-synced pulses (Part 3G); Debug.tsx's conduit line repoints to `SIGNAL_PATH` in the same phase. |
| `THREE.FogExp2` + velocity fog + crane fog-lift | Layered atmosphere system: custom height/distance fog chunk in ALL materials + fog-card banks + tier-gated raymarch pass (Part 3F). |
| `RoomEnvironment` IBL | Scene-matched "MoonEnvironment" PMREM (black dome, green horizon strip, moon disc) so metals pick up believable rims (Part 3E). |
| Cone light billboards, orbital torus rings | Dies with the old look. Godray-ish scattering is handled by the fog system. |
| `scene/Beacons.tsx` finale columns | Reworked into the beacon network of the hidden Signal (kept concept: progressive per-station activation — brief §26 explicitly wants exactly this). |
| Fixed void `#050607` background + no sky | Sky dome + giant moon + sparse stars (Part 3D). |
| Current 17 camera beats | Re-authored 25-beat journey with roll/fog/exposure per beat (Part 3C). |

### 1D · TRAPS — verified failure modes of THIS codebase. Read twice.

Every one of these was hit and fixed during the original build. Several WILL recur during
the overhaul because the overhaul touches the same systems.

1. **`ShaderMaterial` deep-clones `uniforms`.** The object you build in `useMemo` is NOT
   what the GPU reads. Mutating it from `useFrame` silently does nothing — the shader
   renders its t=0 state forever while looking superficially fine. Every animated uniform
   must be written through `materialRef.current.uniforms`. This once froze the entire
   scene's shader animation invisibly. The new terrain/fog/sky shaders are all exposed.
2. **`material.emissive` must be BLACK** on the station materials. `totalEmissiveRadiance`
   is seeded from it before the derived-emissive chunk adds its term; any non-zero value
   makes the whole mesh glow.
3. **`getPoint`, never `getPointAt`.** Camera beats are spaced by narrative time, not arc
   length. `getPointAt` re-parameterises by distance and silently lands every beat on the
   wrong pose (this bug put the camera at the stage when `t` said drafting-table).
4. **Hold easing must keep `remapHold(k.t) === k.t`.** A previous global-CDF version
   drifted every keyframe off its authored time. Ease within segments only.
5. **Scroll geometry is exact, not approximate.** Sticky copy is centred when the viewport
   CENTRE is in its section; the centre leads scroll by `vh/2`. Sections are sized against
   `docH − vh` with `ScrollPad` (50vh) at both ends. Break this and every chapter's text
   drifts ~5.6% off its camera beat. Camera holds sit at chapter MIDPOINTS for the same
   reason.
6. **Tripo meshes cannot be split.** Hundreds to ~1,300 disconnected micro-islands per model (the camera rig measured 1,326); connectivity,
   slicing, symmetry-fitting and raycast probing were all tried and all failed to isolate
   parts (that's why the procedural lens iris was removed). Do not attempt per-part work.
7. **Beat-keyed constants live outside `world.ts`.** Booth flash (`t≈0.545`), machine
   ignition ramp (`t 0.57→0.635+`), stage-monitor fades (`0.28–0.58`), AND the finale
   family — `Station.tsx`'s finale override (`t > 0.875`, ramp `/0.05`) survives the
   overhaul and must retime against crane-begins `0.880` / reveal `0.940` (the other
   finale constants live in components that die: Beacons/FogDriver/FinaleLift).
   Re-authoring beats REQUIRES retiming all of these.
8. **One `onBeforeCompile` per material — compose, never stack.** Assigning a second
   callback silently overwrites the first. Build ONE `patchCorridorMaterial(mat, opts)`
   that applies BOTH transforms in a single callback: the derived-emissive chunk at
   `#include <emissivemap_fragment>` and the fog chunk at `#include <fog_fragment>` —
   disjoint anchors, verified against r185 chunk order (fog_fragment is the last
   meaningful chunk; with renderer tone mapping off, values there are still linear HDR,
   so fog blends correctly and bloom later picks up punched-through emissive). Every
   patched material sets `customProgramCacheKey` covering BOTH patches' variants
   (three caches programs by source — issue #19377-class collisions otherwise). Name
   the world-pos varying uniquely (`vCorrWorldPos`) — `vWorldPosition` already exists
   when envmaps/transmission are on. Fog uniforms live in ONE module-level object whose
   same uniform objects are pushed into every shader — one write per frame updates all.
9. **pmndrs postprocessing is WebGL-only.** Do not migrate to WebGPURenderer; the whole
   post chain (and the look) dies. Also: `Bloom` radius lives on `mipmapBlurPass.radius`,
   not on the effect.
10. **R3F pauses when `document.hidden`** and the in-app preview throttles rAF during tool
    calls. All fps numbers measured through automation are garbage; perf verification is
    REAL-BROWSER ONLY (Part 7).
11. **Fog density maths.** `FogExp2` is `exp(−(d·σ)²)`: at the original plan's σ=0.14 an
    object 25 units out sits at `exp(−3.5²) ≈ 5e−6` visibility (~0.0005%) — the finale
    was mathematically invisible. Current base is 0.038 with a
    crane lift. The new fog system replaces this but must re-derive its own numbers with
    the same rigor (target: silhouette at ~30u, invisible at ~55u in corridor zones).
12. **drei `<Environment preset>` pulls from a CDN** and blocks first paint. Any env map
    must be generated locally (PMREM from a proxy scene) or shipped as a local asset.
13. **Windows/PowerShell quirks** for any pipeline scripts (this repo was built on
    Windows): no `&&` in PS 5.1, prefer bash tool or `;` chaining.
14. **Light-count changes recompile every shader.** three keys programs on the COUNT of
    visible lights per type: toggling `light.visible`, or mounting/unmounting a light,
    recompiles all materials — a visible hitch mid-scroll. `intensity = 0` does NOT.
    Therefore: a FIXED pool of practicals mounted before first paint, crossfaded by
    intensity and teleported between stations; warm shaders with `renderer.compile`.
    (Discovered in research; the current build never hit it because its lights are
    static — the overhaul's station-following practicals WILL hit it if done naively.)
15. **Post-pipeline inversion side-effects.** Moving tone mapping into the composer
    (`<Canvas flat>`, HalfFloat buffers, AgX last) changes the meaning of existing
    values: `toneMapped:false` flags become no-ops, the bloom threshold moves from 0.85
    to 1.0 (HDR luminance), and the calibrated emissive strengths in `world.ts` will
    need one recalibration pass under the new chain — INCLUDING the survivors that use
    `toneMapped:false` additive/basic materials (the dust layers, StageMonitors screens):
    those flags become no-ops and their brightness shifts under AgX-in-composer. Do this
    ONCE, in Phase 8, not piecemeal.
16. **Raise the camera far plane deliberately.** Current `far: 140`; the sky system
    needs ≥320. Keep the moon well inside the far clip (geometry at the clip plane
    flickers), and re-check fog zone maths after the change — far-plane depth precision
    interacts with the soft-particle depth reads on fog cards.

### 1E · Current file map (for orientation)

```
site/src/
  app/            layout.tsx (fonts/meta) · page.tsx · globals.css (tokens, scrims, chips, cursor)
  components/
    SignalLine.tsx        boot: tier detect, reduced-motion, store, composition root
    dom/ScrollDriver.tsx  the single scroll clock (KEEP)
    dom/ChapterBlock.tsx  sections + exact scroll geometry (KEEP, restyle only)
    dom/Chrome.tsx        nav, progress rail, cursor, scroll hint (KEEP, restyle)
    dom/Drawer.tsx        234-bullet SEO drawers (KEEP)
    dom/Loader.tsx        SVG aperture-iris loader (KEEP — it's the iris that works)
    dom/Lightbox.tsx      reel modal (KEEP)
    dom/Fallback.tsx      no-WebGL CSS backdrop (update palette)
    scene/Scene.tsx       canvas, lighting rig, IBL, composition (REWORK)
    scene/CameraRig.tsx   spline sampler + hold easing + portrait comp (EXTEND)
    scene/Station.tsx     GLB lifecycle + idle motions (EXTEND: terrain pads, retimed keys)
    scene/StageMonitors.tsx  procedural reel screens (KEEP; VideoTexture swap point)
    scene/Floor.tsx       flat grid floor (REPLACE → Terrain.tsx)
    scene/SignalConduit.tsx  glowing tube (DELETE → SignalNetwork.tsx)
    scene/Atmosphere.tsx  dust layers + cones + rings (REWORK: dust stays, rest dies)
    scene/Beacons.tsx     finale columns (REWORK into SignalNetwork)
    scene/Post.tsx        bloom/CA/vignette/noise/SMAA + focus pull (EXTEND)
    scene/Debug.tsx       ?debug=1 rig (KEEP, add terrain/fog helpers)
  lib/
    world.ts     station transforms, CAMERA_KEYS, palette consts (RE-AUTHOR beats/layout)
    materials.ts derived-emissive patch (EXTEND with fog chunk)
    chapters.ts  all copy + 234 bullets (KEEP content; copy tweaks allowed)
    tier.ts      device probe + per-tier config (EXTEND flags)
    store.ts     zustand + per-frame channel (EXTEND channel fields)
```

---

## PART 2 — RESEARCH DIGEST

> Filled from the six-domain research pass. Each subsection ends with a DECISION the
> implementation must follow.

### 2A · Atmosphere & fog — DECISION: layered system, no true volumetrics

- **Base layer (ALL tiers): analytic height+distance fog patched into every lit material**
  via `onBeforeCompile`, replacing `#include <fog_fragment>`. `scene.fog` stays **null**
  forever (USE_FOG never defined → stock chunks compile empty → zero double-fog risk).
  The maths is iq's analytic height fog — `fogAmt = (a/b)·e^(−camY·b)·(1−e^(−t·rdY·b))/rdY`
  — plus the **per-channel extinction / in-scatter split**: `col = col·exp(−t·βe) +
  fogCol·(1−exp(−t·βi))`. The emerald tint lives ONLY in βi × a moon-directional term
  `pow(max(dot(rd, moonDir),0), 6–8)` — this is the mechanism that makes "green comes
  from light, not a filter" literal. Noise breakup via ONE 512² tiling noise texture,
  domain-warped (The Sleepers technique, Codrops 2026) — texture fetch, not procedural.
- **Art layer (desktop/laptop/mobile): fog cards.** 8–10 (desktop) noise-animated alpha
  planes placed as banks along the corridor. `NormalBlending` (fog occludes; additive
  reads as glow), `depthWrite:false`, proximity fade `smoothstep(1.5, 6, dist)`, soft-
  particle depth fade on desktop only. Fixed camera path ⇒ assign `renderOrder` once by
  spline position; never sort at runtime. Overdraw cap: ≤3–4 overlapping screen layers.
- **Garnish (desktop only): half-res raymarched fog pass** — 12–16 jittered steps against
  the depth buffer, 128³ R8 noise, bilateral upsample, inserted BEFORE bloom
  (~1–2 ms). Adopt `three-volumetric-pass` (Ameobea) or hand-roll from its architecture.
- **Emissive punch-through** (the reveal grammar's "light before surface"): glow sprites
  with a slower transmittance curve `T_glow = exp(−σ·k·d), k≈0.25–0.4` vs surfaces'
  `T_surf = exp(−σ·d)` — a light reads 2.5–4× the distance a surface does. Sprites are
  the cheapest layer and ship down to the fallback tier.
- **REJECTED**: froxel fog (WebGL2 has no compute; layered-FBO emulation is research-grade),
  pmndrs `GodRaysEffect` (Crytek radial blur needs the source ON SCREEN — breaks
  constantly on a turning spline camera; confirmed in pmndrs #435/#361). If shadowed
  shafts ever become an art requirement: `three-good-godrays` (shadow-map raymarch,
  off-axis-safe) — smoke-test against three 0.185 first.

### 2B · Terrain & rocks — DECISION: CPU-displaced once, everything static

- **Displace on CPU at load, not in the vertex shader.** The path is fixed and terrain
  never animates: write heights into the BufferGeometry once, `computeVertexNormals()`.
  Zero per-frame vertex cost, exact analytic normals, and the same JS `getHeight(x,z)`
  grounds rocks, pads, and the camera spline. 25–65k verts × 5 noise octaves ≈ 2–5 ms.
- **Grid: 256×96 anisotropic** (~49k tris) for a ~300×80u corridor — the corridor is
  ~4× longer than wide, so square cells waste long-axis segments. Rule: only octaves
  with wavelength ≥ 5–6× cell size displace vertices; everything finer goes into
  fragment normals. 192×96 (37k) is safe if the camera never dips below ~4u.
- **Noise recipe:** 4-octave fBm simplex (lac 2.0, gain 0.5, amp 4–8u, base freq 1/40u)
  + ridged `(1−|n|)²` at low frequency blended 60/40, + 2–3 analytic crater stamps
  (rim-bump minus bowl smoothstep) off-path for lunar identity.
- **Noise is CPU-only.** The GPU never re-evaluates terrain noise (shading uses
  slope/height + texture maps; fog uses its own noise TEXTURE), so there is NO JS↔GLSL
  noise-matching problem. Add `simplex-noise` (npm, seeded) — NOT currently in
  package.json — or inline a seeded simplex; one instance drives heights, pads, scatter
  and camera grounding so all agree by construction.
- **Pads:** `h = mix(padY_i, h_noise, smoothstep(rIn, rOut, d))`, rIn 6–8u, rOut 12–16u,
  min-of-masks across the 6 sites; plus a corridor damp (amp ≤0.5u within ~4u of the
  camera polyline) so the lens never clips ground.
- **Material:** `MeshStandardMaterial` + the SAME composed patch as the stations (fog
  chunk + slope/height ramp near-black→charcoal→dark-green + planar world-XZ detail
  normal faded by slope + 6-emitter emerald light-pool loop + per-pad contact darkening
  `uniform vec4 uPadShadow[6]`). **The in-shader pad darkening replaces drei
  ContactShadows entirely** (0 draw calls, 0 RTs vs 6+6).
- **Rocks:** 4 procedural variants (Icosahedron detail 2/3, 3–4-octave 3D-noise
  displacement, flattened bottoms, seeded) — beats CC0 GLBs on weight, style-match and
  determinism. ~150 instances in **one `BatchedMesh`** (1 draw call + built-in
  per-instance frustum culling, which `InstancedMesh` lacks); scatter by seeded
  jittered-grid with exclusions (≥5u from path, ≥ padR+4u from pads, slope <0.55);
  triplanar detail normals on rocks only (3 fetches, tiny screen area). Fallback tier:
  4 InstancedMesh.
- **Distant ridges:** world-fixed open cylinder r≈250 (256×2 segs, ridged-noise
  displaced, ~2k tris, BackSide) + optional flank ridge planes at ~120u. Do NOT parent
  to camera — the fixed 240u travel gives slow genuine parallax. Gradient material
  patched with the corridor fog chunk so peaks dissolve into atmosphere.
- **Edge:** fold-down skirt ring merged into the terrain geometry (or author the outer
  10u of the amplitude envelope to roll off steeply).
- **Detail normal texture:** 1024² tileable regolith normal from **Poly Haven CC0 lunar
  sets** (`moon_01`, `moon_02`, `moon_macro_01`) — KTX2 **UASTC** (never ETC1S for
  normal data), RG + reconstruct-Z.

### 2C · Lighting, AO, reflections — DECISION: env-first, fixed light pool, N8AO

- **NEW TRAP discovered (now Trap #14):** three keys shader programs on the **count** of
  visible lights per type — toggling `light.visible` or mounting/unmounting a light
  recompiles every material mid-scroll (visible hitch). Practicals are a **fixed pool of
  5 PointLights mounted before first paint**, crossfaded by `intensity` and teleported
  between stations. `intensity=0` causes no recompile. Warm with `renderer.compile`.
- **Ambient = a custom "MoonEnvironment" PMREM**, not AmbientLight: drei
  `<Environment frames={1} resolution={256}>` with children — black-green dome +
  `<Lightformer>` moon disc (aligned with the moon light direction) + emerald horizon
  strip + two dim side rims. One-shot, zero per-frame cost, gives metals believable
  green rims. `scene.environmentIntensity` ≈ 0.22 desktop.
  **Tripo caveat:** image-to-3D materials often read roughness≈1 → envmap invisible.
  Our loader already forces roughness 0.45 / metal 0.10 — keep that, and hand-raise
  metalness on hero surfaces where rims should live.
- **Moon key:** ONE DirectionalLight `#9dbfa8` int ≈0.35 (desaturated — saturation is
  reserved for practicals), constant direction, **sole shadow caster**: tight ortho box
  (±11u) following the camera's look target with **texel snapping** (kills shadow swim),
  `shadowMap.autoUpdate=false` + `needsUpdate=true` only on scroll delta — shadows are
  free while the user reads. 2048 desktop / 1024 laptop / none mobile.
- **Practical breathing:** Quake lightstyle strings sampled at 10 Hz (`"mmnmmommommnonmmonqnmmo"`
  flicker, candle for hero), driving **both** `light.intensity` and the fixture's
  emissive uniform from the same value — that is what sells "green comes from sources".
  Amplitude ≤15% or the bloom threshold strobes.
- **AO:** N8AO as FIRST effect — present today only as a TRANSITIVE dep of
  @react-three/postprocessing: either use its `<N8AO>` wrapper component, or add `n8ao`
  to package.json before importing `N8AOPostPass` directly (a lockfile refresh would
  otherwise break the import). It — computes normals from depth (NO extra
  normal pass, unlike pmndrs SSAO which re-renders all geometry). `gammaCorrection:false`
  in our linear chain, AO **color `#06110a`** (occlusion reads deep-green, not dead
  black), aoRadius ≈1.2, intensity ≈3.5, Medium/full-res desktop, Performance/halfRes
  laptop, OFF mobile. Do not pair with drei AdaptiveDpr (react-postprocessing #280) —
  use `PerformanceMonitor`-driven DPR instead and REMOVE the existing `<AdaptiveDpr>`.
- **Hero garnish (desktop):** one-shot CubeCamera (`frames={1}`, 128px) at the rig.
- **REJECTED:** CSM (multiplies caster draws ×4, built for free-roam), SSR/planar
  (screen-space holes + ghosting under scroll-scrub; planar doubles draw calls),
  shadowed point lights (×6 renders each), per-frame cubemaps.

### 2D · Camera feel & case-study grammar — DECISION: keep our machinery, add feel channels

- Every strong precedent (Codrops cinematic-scroll 2025, DEPT dual-spline writeup,
  Theatre.js article's own conclusion) converges on what we already have: normalized
  progress → data beats → dual splines. **Keep our sampler** (index-space `getPoint` +
  `remapHold` — our narrative-time spacing is deliberate; arc-length advice in the
  articles solves a problem we don't have).
- **Add frame-rate-independent damping everywhere:** `v = lerp(v, target, 1−e^(−λ·dt))`
  with per-channel λ — position 8, lookAt 6, roll 4, FOV 3 (slowest = most subliminal).
  Our existing `0.08/frame` constants convert to this form.
- **Roll:** velocity- and curvature-driven banking, ±2–4° sustained, 6° momentary peak
  (film sources: 5–10° is already "subconscious unease"). Never roll while pitching
  fast. Zero under reduced motion.
- **Velocity channel:** smoothed `rawVel` with clamp and **zero-snap below a threshold**
  (kills idle flicker); drives FOV breathing (≤ +2–4°), fog shimmer, dust streaking.
- **The single highest physicality-per-triangle trick** (multiple case studies):
  **foreground occluders** — near-black low-poly silhouettes 0.5–2u off the spline
  sweeping the near-frustum during pass beats (our rocks InstancedMesh does double duty).
- Parallax ratios that read as natural depth: bg 0.2–0.3×, mid 0.4×, fg 0.5× of camera
  speed (our world layout delivers this geometrically — ridges at 250u, rocks at 2–10u).
- **Overshoot: rejected.** No positional overshoot anywhere (a scrubbed camera that
  overshoots reads as lag); at most the roll channel may settle with ≤0.5° of ease-back
  into holds. The brief's "subtle overshoot only where appropriate" resolves to: not
  appropriate here.
- Igloo Inc's lesson: exactly ONE signature effect per moment; seams masked by a
  shader moment, never a cut. Lusion/Unseen: RT-blend seams are possible but our
  fog-out/fog-in transitions serve the same role at zero cost — RT seams stay OUT.
- DOM text staging grammar (Codrops): in 0.25s / stagger 0.02 / hold / out 0.25s — our
  clip-reveal system already matches; keep.

### 2E · Sky & moon — DECISION: NASA data, real sphere, layered planetarium

- **NASA CGI Moon Kit (SVS #4720) is public domain** (credit "NASA's Scientific
  Visualization Studio"). Ship the 4K sRGB color → downres **2K KTX2 ETC1S** (~1–1.5MB)
  + a **normal map baked offline from the LOLA displacement** (2K UASTC / 1K) — crater
  relief along the terminator is the single biggest realism win. Do NOT vertex-displace
  a distant moon (silhouette must stay round).
- **Real `SphereGeometry` (48×32), D≈220u, R≈29–39** → 15–20° angular diameter
  (θ=2·atan(R/D)). **The whole sky group (moon, dome, star shells, nebula)
  TRANSLATE-FOLLOWS the camera** — position copied each frame (never rotation), so the
  moon's distance and size stay constant over the 254u ride. A world-fixed moon at 220u
  would balloon to ~41° and swing 60° off-axis by the finale (verified maths). Authored
  parallax instead: offset the group by `−travelDelta · 0.03` so the sky drifts ~7–8u
  over the full journey — alive, never lurching. **Requires raising camera far plane
  140 → ≥320** and keeping the moon off the far clip (flicker).
- **Terminator:** light the moon with a **dedicated same-direction DirectionalLight on
  layer 2** (`moonMesh.layers.set(2)`, light layer 2, `camera.layers.enable(2)`) so its
  intensity/color can exceed the corridor key without contaminating it. Soften the
  airless-hard terminator with a wrap term `pow(NdotL·0.5+0.5, k)` via onBeforeCompile;
  add an emerald **fresnel rim biased to the lit limb** — the one element allowed to
  cross the bloom threshold.
- **Sky dome:** inverted sphere r≈280, BackSide, `fog:false`, `depthWrite:false`,
  authored zenith→horizon ramp. **Hard requirement: the fog system's far color and the
  dome's horizon color are the same uniform value** — geometry must dissolve into sky
  seamlessly. `scene.background` stays a flat near-black as backstop.
- **Stars:** custom Points shader, TWO shells (r=240/265 — real parallax between them),
  800–2000 total, 3 magnitude classes as attributes, `gl_PointSize` 1–3px·DPR (size
  attenuation OFF), radial-smoothstep discs, brightness-only twinkle on the bright class
  only, density thinned near horizon and around the moon. drei `<Stars>` is the
  fallback-tier stand-in only.
- **Nebula:** ONE 512² baked FBM gradient card behind the moon, additive, opacity ~0.3.
  A full skybox nebula is rejected (weight + fights the near-black direction).
- **Veil:** 2–4 giant slow fog cards at 100–150u between camera and moon so the moon is
  sometimes partially hidden — "participates in atmosphere" (brief §22).
- Draw order: dome(-3) → nebula(-2) → stars(-1) → moon(0) → transparent fog cards.

### 2F · Post, color & performance — DECISION: HDR chain, tone-map LAST, AgX

- **Pipeline inversion (biggest existing-code change):** renderer
  `toneMapping = NoToneMapping` (R3F `<Canvas flat>`), `antialias:false`, `alpha:false`;
  EffectComposer `frameBufferType: HalfFloatType`, `multisampling: 0` (N8AO forbids
  MSAA). Tone mapping happens ONCE, at the END of the chain, as `ToneMappingEffect`.
  Without this, colors clamp to [0,1] at the start and HDR bloom thresholds never fire.
- **AgX over ACES:** ACESFilmic skews saturated green→yellow near clip (the "notorious
  six"); Neutral crushes shadow detail (fatal in a near-black scene). **AgX holds
  emerald hue as sources brighten** — exactly this art direction. Its mild flatness is
  restored by the grade AFTER tone mapping.
- **Selective bloom for free:** with HalfFloat buffers, `luminanceThreshold: 1.0` — only
  HDR pixels (emissives boosted ×2–8 by the existing `uStrength/uBoost` uniforms, plus
  hot speculars) bloom. No SelectiveBloomEffect (it re-renders the scene). `mipmapBlur`,
  levels 7, intensity 0.6–1.0.
- **Chain order:** RenderPass → N8AO → EffectPass[Bloom] → EffectPass[DepthOfField]
  (own pass; **toggle `.enabled`, never mount/unmount** — rebuilds recompile shaders and
  hitch mid-scroll; drive **`focusDistance`/`focusRange`** (world units in postprocessing
  6.39.x — `worldFocusDistance` is deprecated) + `bokehScale` as uniforms, ramp
  bokehScale →0 before disabling) → EffectPass[pre-exposure (tiny custom multiply Effect
  driven by the beat `exposure` channel) → ChromaticAberration (velocity-driven ONLY —
  zero at rest, ≤0.0012 at speed; that is its §29 justification: a motion artefact, not
  a filter) → ToneMapping(AGX) → grade → Vignette 0.55 → Noise premultiplied 0.05 →
  SMAA MEDIUM]. Temporal AA: rejected — pmndrs ships no TAA, three's TAARenderPass is
  composer-incompatible, and temporal accumulation ghosts under scroll-scrubbed motion.
- **Grade:** LUT3DEffect with a 33³ `.cube` authored in DaVinci Resolve (free) on
  desktop; `HueSaturation`+`BrightnessContrast` (merged, ~free) on laptop/mobile — and
  honestly sufficient everywhere if LUT authoring stalls.
- **frameloop="demand"** + `invalidate()` from Lenis/GSAP/pointer-move, **plus a 12fps
  idle heartbeat** (`setInterval(invalidate, 83)` while the tab is visible, 8fps on
  mobile) — this is the binding policy that reconciles demand-mode with the idle life
  the spec promises everywhere (lightstyle breathing, ambient seam pulses, star
  twinkle, hold-orbit drift, "the system idles alive" at t=1.0). Parked cost: ~12
  frames/s of a scene that renders in ~11–15ms — trivial; true zero only when hidden.
- **Assets:** KTX2 **ETC1S for basecolor** (134MB→~17MB VRAM across the 6 GLBs, ~8×; test
  quality 200–255 — dark gradients expose ETC1S banding; switch the hero to UASTC if it
  bands), UASTC for normal/detail maps, `gltf-transform meshopt+quantize` for wire size,
  and a **50%-simplified GLB set for the mobile tier**. Concrete pipeline (Phase 10):
  install KTX-Software (`toktx` — gltf-transform's ktx commands shell out to it), then
  `gltf-transform etc1s in.glb out.glb --quality 255` per GLB (the existing textures are
  WebP-in-GLB via EXT_texture_webp — gltf-transform decodes and re-encodes them), and
  **ship the basis transcoder locally**: copy `basis_transcoder.{js,wasm}` into
  `/public/basis/`, `ktx2Loader.setTranscoderPath('/basis/').detectSupport(gl)` — the
  drei/three default transcoder path is a CDN, which 5C bans.
- **Adaptive:** `PerformanceMonitor` (bounds 45–58fps, `flipflops`→`onFallback` drops a
  whole tier permanently); DPR is the quadratic lever. Remove `<AdaptiveDpr>` (N8AO
  conflict, react-postprocessing #280).
- **Confirmed:** pmndrs postprocessing + n8ao are WebGL-only; three's WebGPU post is a
  different (TSL) system. Staying on WebGLRenderer remains correct in 2026.

### 2G · Reconciliations (where researchers disagreed, this wins)

1. **`scene.fog` is null everywhere.** The terrain/ridge researcher assumed `FogExp2`;
   the fog system supersedes it — terrain, ridges, rocks and stations all take the same
   composed fog chunk. The ridge material's "fog:true" advice translates to "include the
   custom chunk", and FogExp2 density maths in 2B are superseded by 3F's zone table.
2. **Grounding = in-shader pad darkening** (terrain researcher), not drei ContactShadows
   (lighting researcher's suggestion). Zero draw calls wins; ContactShadows only as an
   optional desktop-tier extra under the two figure-adjacent stations if pads look weak.
3. **Sampling stays index-space** (`getPoint` + authored `t`) despite articles using
   `getPointAt` — Trap #3 stands; the articles' λ-damping and lookahead ideas are
   adopted INSIDE our sampler.
4. **Exposure channel** is a pre-tone-map multiply Effect (2F), not
   `renderer.toneMappingExposure` (a no-op under NoToneMapping).
5. **RT-blend seam transitions** (Unseen-style) are rejected for now — fog-out/fog-in
   carries the seams at zero cost; revisit only if polish passes demand it.
6. **StageMonitors** get throttled (repaint at ≤12fps, or only while chapter 2 is
   active AND scroll is moving) — the audit flagged 3 canvas repaints + texture uploads
   per frame as a hidden cost the new budget can't ignore.
7. **Fog is parameterised by σ (density) + height falloff, never near/far.** Early
   drafts of Part 4 said `fogNear/Far`; the exponential model in 2A/3F is the spec, and
   the store/uniform names now match it. If you see near/far anywhere, it's stale.
8. **Stage hold at 0.420** is the accepted approximation of the exact ch2 midpoint
   (0.425) — it matches the shipped scroll-geometry convention; do not "fix" it.

---

## PART 3 — THE VISUAL BLUEPRINT

### 3A · World geography

One continuous corridor. The old 40-unit line becomes a **~240-unit journey** so each
chapter has room for the full discover→approach→pass→depart arc. Chapter `t` ranges are
**unchanged** (they are load-bearing for DOM scroll geometry — Trap #5); only world-space
positions stretch.

```
        +X
         │      ridge ring r≈180 about the corridor midpoint (53–307u from any
         │      camera position — inside far=320), 30–80u tall; flank ridges ~120u
   ══════╪══════════════════════════════════════════════════════
         │   MOON dir ≈ normalize(-0.35, 0.22, -0.9), ahead-left
         │
  z=+14  │ camera start (establish vista)
  z=-20  │ ST0 rig       x=+3   pad r=6     chapter 0
  z=-60  │ ST1 table     x=-9   pad r=7     chapter 1
  z=-100 │ ST2 stage     x=+8   pad r=8     chapter 2
  z=-128 │ ST3 booth     x=0    pad r=5     chapter 2→3 gate (fly-through)
  z=-168 │ ST4 machine   x=-9   pad r=7     chapter 3
  z=-208 │ ST5 array     x=+8   pad r=8     chapter 4
  z=-240 │ path runs off into haze; finale crane looks back over everything
```

- Camera path meanders ±10–12 in X between stations (S-curve; never straight for >30u).
- Station scales stay as-is (3.0–3.6). Positions/rotations re-authored in `world.ts`
  (`STATIONS[i].position`), each rotated to face its authored approach direction.
- Terrain footprint ~320×100 units centred on the corridor; beyond it, ridge meshes and
  the sky take over. Fog owns everything past ~55 units.
- **Every station sits on a flattened pad** blended into the terrain (smoothstep mask,
  radius per table above) with a baked dark contact gradient under it (grounding — brief
  §18). Station `y` = pad height (no more global y=0 assumption).

### 3B · Per-asset cinematic language (each machine gets its own grammar — brief §10)

| # | Asset | Approach | Camera grammar | Light grammar |
|---|---|---|---|---|
| 0 | Camera rig | Seen first as a distant practical light in the establish vista; approached obliquely, high→low | Wide establish (fov 54) → descending dolly → settle into the −31° 3/4 hero at fov 42; slow parallax orbit on hold | Slates flicker on power-up (exists); moon rim from behind-left; pad practicals warm the rail base |
| 1 | Drafting table | Low tracking shot skimming terrain; table breaks the horizon as a silhouette first — the first full fog-reveal grammar of the piece | Ground-hugging (y≈0.9) run-in → rise into over-the-shoulder past the Cyphernaut at fov 42; **figure left third, copy right** (alternation — 3H) | The table surface IS the key light of the shot (emissive 2.6 breathing); one dim practical low behind the figure for separation |
| 2 | Stage | Frontal, symmetric, processional | Centreline push-in (fov 46→44) that STARTS LOW and tilts up — the canopy's height is the shot (brief: vertical emphasis); roll-in ≤1.2°; monitors orbit into frame during the hold; camera never crosses the canopy; copy left | Canopy ring + console glow; a cone of scattered light above it rendered by the fog system, not a billboard |
| 3 | Booth | THE fly-through gate between chapters 2/3 | Approach dead-on fov 44→46 (the piece's tight lens — Part 0 #9) → widen to 52 through the crossing; **two near-path rocks sweep the frame edges on approach (foreground occlusion)**; panels flash at crossing (exists, retime); one beat of near-black on exit | Panels + interior bounce only; the corridor's darkest zone is right after it |
| 4 | Machine | Lateral — camera runs parallel to the panel row | Side dolly (subject fills lower 2/3), hub enters frame first, `uSeq` ignition chases the camera down the row; hold at 3/4 top-down; copy right | Each panel is a practical; ignition timed so light "follows" the visitor; the un-ignited half of the row sits in the deepest shadow of any station (brief: deeper shadows) — no fill |
| 5 | Array | Distant reverence → slow approach; biggest negative space of the journey; then an explicit PULL-AWAY | Long-lens feel (fov 40) from ~14u out, dish at RIGHT third of frame, copy left; scroll-velocity spin-up (exists); hold drifts slowly; the 0.860 beat pulls off and away from the dish before the crane takes over | Beads twinkle; strongest moon rim of the piece; first place the network visibly pulses toward the horizon |
| — | Finale | Crane up + back, looking down the corridor just travelled | fov 42→60, exposure lifts, fog thins; progressive activation ST0→ST5, then the buried seam holds a low glow | The one moment "the system" is legible — then it settles to idle breathing |

### 3C · Camera beat table (re-authored `CAMERA_KEYS` — ~26 beats)

Beat type is EXTENDED (Part 4): `{ t, pos, look, fov, hold?, roll?, fog?, exposure?, dof? }`.
Holds sit at chapter midpoints (Trap #5). The booth crossing stays the ch2→3 hinge. This
table is authored intent; exact coordinates are tuned live in `?debug=1&orbit=1` with
`__pose()` during Phase 6 — do NOT hand-derive them blind.

| t | beat | shot |
|---|---|---|
| 0.000 H | ESTABLISH | very wide (fov 54), y≈4.5: moon, ridge lines, one distant practical (the rig's) |
| 0.035 | begin travel | descend toward the corridor floor; speed builds |
| 0.060 H | hero hold | the −31° rig 3/4 at fov 42; copy in left negative space |
| 0.100 | hero pass | arc past the rig; it exits frame right |
| 0.120 | departure | rig lights shrink behind; fog banks build at frame edges |
| 0.150 | fog entry | visibility collapses; fov 46; darkest travel beat |
| 0.175 | discovery | table silhouette + surface glow through haze |
| 0.210 H | table hold | over-the-shoulder; fov 42; figure left third, copy right |
| 0.260 | table pass | low skim past the table edge |
| 0.300 | transition | open terrain; distant stage glow appears |
| 0.340 | stage approach | centreline, symmetric |
| 0.420 H | stage hold | push-in complete; monitors orbiting |
| 0.480 | stage depart | pull off axis; booth's vertical silhouette ahead |
| 0.520 | booth approach | dead-on, fov 46 |
| 0.545 | FLY-THROUGH | fov 52, panel flash, one beat of near-black on exit |
| 0.570 | emerge | machine hub appears low-left through thinning haze |
| 0.600 | lateral run | camera parallel to panel row; ignition chases |
| 0.635 H | machine hold | 3/4 top-down on the row |
| 0.690 | depart | row recedes; array glow far right |
| 0.730 | array distant | long-lens reverence, big negative space |
| 0.800 H | array hold | dish at one-third frame; network pulses visible |
| 0.860 | last pass | camera slides past the dish rim and PULLS AWAY — distance grows before the crane |
| 0.880 | crane begins | rise + turn back; fog starts thinning |
| 0.940 H | THE REVEAL | the whole corridor below; progressive activation ST0→ST5 |
| 1.000 H | settle | slow drift; CTA; the system idles alive |

Per-beat `fog`/`exposure` drive the environment timeline (Part 4). Roll stays ≤1.5° and
only banks INTO lateral moves. Every beat-keyed constant in `Station.tsx` /
`StageMonitors.tsx` is retimed against this table (Trap #7).

### 3D · Sky, moon, stars (spec — technique basis in 2E)

- **Moon**: NASA WAC albedo 2K KTX2 + LOLA-baked normal, `SphereGeometry(34, 48, 32)` at
  `MOON_DIR·220` (θ≈17°) **inside the camera-following sky group (translate-follow,
  parallax factor 0.03 — anchor rule in 2E)**, layer 2 with its own DirectionalLight
  `#dfffe8` int≈2.5 aligned to `MOON_DIR`; wrap-softened terminator (k≈0.8), emerald fresnel rim `pow(1−NdotV, 3)`
  biased to the lit limb (the only sky element allowed past bloom threshold), `fog:false`.
  Texture stays desaturated grey — green arrives as LIGHT only.
- **Dome**: r=280 inverted sphere, zenith `#010302` → horizon `#0a1710` (THE shared fog
  far color uniform), renderOrder −3.
- **Stars**: two shells r=240/265, 1,400 total desktop (70% 1px faint / 25% mid / 5%
  2–3px bright), brightness-only twinkle on the bright class, thinned near horizon and
  within ~12° of the moon.
- **Nebula**: one 512² baked FBM card behind the moon, additive, opacity 0.3.
- **Veil cards**: 3 huge slow cards at 100–150u that occasionally drift across the moon.
- **Camera far plane: 140 → 320** (Scene.tsx Canvas prop) — required by all of the above;
  `camera.layers.enable(2)` for the moon layer.
- Establish beat (t=0) composition: moon upper-left third, rig practical lower-right,
  ridge line cutting the horizon at the lower third. The journey travels TOWARD the moon
  azimuth so it slowly grows and parallaxes.

### 3E · Lighting rig (spec — technique basis in 2C)

| Source | Spec | Notes |
|---|---|---|
| Moon key | DirectionalLight `#9dbfa8` int 0.35, dir = −MOON_DIR, sole shadow caster; ortho box ±11u following `scroll.look`, texel-snapped, map 2048/1024; `shadowMap.autoUpdate=false`, `needsUpdate` on scroll delta | The world's shaping light; hard black shadows are the moon look |
| Practical pool | 5× PointLight, `castShadow:false`, decay 2, `distance 12` (free culling), int 10 at focus, `#35e08a` stations / `#bfe8cf` hero accent | FIXED POOL — mounted at boot, crossfaded ±8% scroll around each station window, teleported between stations. NEVER toggle `.visible` (Trap #14) |
| Breathing | Quake lightstyle strings @10Hz, ≤15% amplitude, driving light.intensity AND the fixture emissive uniform together | candle-string on hero, gentle sine-sum elsewhere |
| Ambient | MoonEnvironment PMREM (drei `<Environment frames={1} resolution={256}>` + Lightformers: moon disc on MOON_DIR, emerald horizon strip, 2 dim side rims), `environmentIntensity 0.22` | replaces RoomEnvironment AND all AmbientLight |
| AO | N8AO first in chain: color `#06110a`, aoRadius 1.2, intensity 3.5, Medium full-res desktop / Performance halfRes laptop / off below | occlusion reads deep-green |
| Contact | per-pad radial darkening in the terrain shader (`uPadShadow[6]`) | replaces ContactShadows; 0 draws |
| Hero garnish | one-shot CubeCamera 128px (desktop) | real local reflections on the rig |

Target ramp everywhere: BLACK → shadow → dark green → muted green → emerald highlight.
Large areas STAY black — if a paused frame has no true blacks, lower env intensity first.

**Relight warning (audit finding):** the current `TravellingRig` intensities (140/26/40)
were tuned against a shader floor that IGNORES scene lights. On real lit terrain those
values are meaningless — Phase 5 is a full relight from the table above, not a port.

### 3F · Atmosphere zones (spec — technique basis in 2A)

The corridor is divided into authored **fog zones** (data in `world.ts`), interpolated by
the environment timeline; the per-beat `fog` value scales the zone's base density.

| z range | zone | σ (base) | character |
|---|---|---|---|
| +14 → −30 | establish/hero | 0.020 | clearest air of the piece; moon crisp |
| −30 → −52 | bank 1 | 0.055 | first collapse; table reveal grammar plays here |
| −52 → −92 | table→stage | 0.032 | breathing room; stage glow visible from ~35u |
| −92 → −136 | stage→booth gate | 0.048 | thickens INTO the fly-through; darkest exit |
| −136 → −176 | machine run | 0.030 | lateral clarity for the panel row |
| −176 → −216 | array reverence | 0.026 | long sight-line; network pulses visible |
| −216 → end | finale | 0.016 | thinnest air; the crane must read 200u |

- Fog cards are placed at zone boundaries as flanking banks (the "corridor between
  volumes" diagram in the brief §12), 2–3 deep, different noise offsets.
- Reveal grammar per station (brief §13) maps to layers: glow sprite only → surface at
  fogAmt 0.9–0.97 (fog color a half-stop brighter than object albedo = automatic
  silhouette) → fresnel rim with boosted transmittance → texture → full detail ≤10u.
  σ per zone is tuned so each phase lands at the beat table's authored distances —
  the distances are constants, so tune per zone, never globally. (The brief's 8-stage
  ladder compresses to these 5 named stages; the intermediate "partial geometry /
  medium detail" steps are carried continuously by the falling fogAmt curve, not by
  discrete states.)
- The old `FogDriver` speed/crane modulation logic survives as inputs to the timeline
  (+10% σ with scroll speed; crane multiplies the finale zone toward 0.012).

### 3G · The hidden Signal (replaces the tube — brief §4/§25)

The Signal becomes infrastructure you notice, not a graphic you follow:

1. **Buried seam** — the station-connecting polyline evaluated as distance-to-segments in
   the terrain fragment shader (7 segments, cheap ALU). Reads as a faint warm seam in the
   regolith: base intensity ~0.02, never a stripe. Brightens locally (to ~0.35) only
   within ~10u of a travelling pulse position.
2. **Node pucks** — one `InstancedMesh`, ~24 low cylinders (12-gon) along the path every
   ~10u, each with a small emissive window; instance-level pulse phase.
3. **Cable props** — six short static arcs (low-poly tube segments) from the nearest node
   up into each machine's base; dark material, one thin emissive strip each. They answer
   "how are these connected" at close range.
4. **Distant beacons** — 3 faint light pillars far off-corridor (rework of `Beacons.tsx`),
   the "distant lights" the beat table calls for; they also serve fog reveals.
   **Cadence (brief §24):** each beacon swells over 2–3s every 20–40s on seeded offsets,
   and one beacon always fires during each station hold — the world signals in the
   distance while the visitor reads.
5. **The pulse** — one shared path-parameter uniform (driven from `scroll.t` exactly like
   the old conduit's `uProgress`, so the sync architecture survives) that raises seam/node
   intensity as it passes. Ambient secondary pulses every ~7s so the world never reads
   dead.
6. **Finale** — progressive activation ST0→ST5 (existing finale wave logic, retimed),
   then the entire seam holds a low glow: the one legible image of the network.

Delete `SignalConduit.tsx`. Create `SignalNetwork.tsx` owning items 1–5's uniforms (seam
values live in the terrain shader; the network component writes them through the terrain
material ref — Trap #1).

### 3H · UI over cinema (brief §27–28)

The DOM layer already is the editorial system the brief asks for — keep the architecture,
retune the presentation: scrim opacities drop (the world is darker now); chip borders dim
~30%; the progress rail loses its glow dot for a plain tick; type sizes unchanged (they
are load-bearing for the copy windows).

**Composition cadence (corrected):** the current DOM puts copy LEFT on chapters 0 AND 1 —
two consecutive lefts, breaking the brief's alternation. New cadence, matching 3B/3C:
ch0 **L** (rig right) · ch1 **R** (figure left) · ch2 **L** (stage centre-right of
push-in) · ch3 **R** (panel row left) · ch4 **L** (dish right) · ch5 **C**. In
`ChapterBlock.tsx` the `right` set becomes `{1, 3}` (currently `{2, 4}`) — a one-line
change plus scrim-variant swap, done in Phase 9. Full-cinematic no-text beats exist
naturally in the transit ranges — do not add text there.

### 3I · Particles (brief §3/§21 — restrained)

The three seeded dust layers in `Atmosphere.tsx` SURVIVE but are re-specced for the new
world (their counts/colors were tuned for the dead void look): counts per 5A row, color
pulled down to `#22402f`-family so motes read only where light shafts or practicals
catch them, opacity halved, and the streak-with-velocity behaviour (`uSpeed` stretch)
retained — it is the brief's "dust streaking" speed cue. Two additions, both cheap:
~40 near-ground **debris motes** (slightly larger, slower, y < 1.5u, only within 20u of
stations) and the existing far layer re-labelled as **distant motes** with fog-chunk
attenuation so they die into the atmosphere. The cones and orbital rings in
Atmosphere.tsx are deleted (Phase 4); dust is NOT deleted. No new particle systems —
the brief's ceiling is restraint.

---

## PART 4 — TECHNICAL ARCHITECTURE

### 4A · New/changed files

```
lib/world.ts          re-authored: STATIONS (new positions/y), CAMERA_KEYS (Part 3C),
                      SIGNAL_PATH polyline, PADS, MOON_DIR, palette tokens
lib/env.ts            NEW: environment timeline — pure interpolators over the beat
                      array ({fogSigma, exposure, dof}, same pattern as fovAt()).
                      SAMPLED ONLY by CameraRig's useFrame (the single beat sampler),
                      which writes results into the channel; everything else reads the
                      channel, never the beats
lib/terrainNoise.ts   NEW: seeded fBm/ridged noise — JS ONLY (2B: the GPU never
                      re-evaluates terrain noise). Add `simplex-noise` to package.json
                      (not currently installed) or inline one. Drives heights, pads,
                      scatter, station y, camera grounding
scene/Terrain.tsx     NEW: corridor mesh + pads + seam uniforms + contact darkening
scene/Rocks.tsx       NEW: 3-4 procedural rock variants → ONE BatchedMesh
                      (per-instance frustum culling); InstancedMesh only on fallback
scene/Ridge.tsx       NEW: distant mountain silhouettes (2 layers, slow parallax)
scene/SkyMoon.tsx     NEW: dome gradient + moon sphere + star Points
scene/FogSystem.tsx   NEW: fog uniforms owner + card banks (+ desktop raymarch pass)
scene/SignalNetwork.tsx NEW (Part 3G) — replaces SignalConduit.tsx + Beacons.tsx
scene/Scene.tsx       recomposed: new lighting rig, MoonEnvironment PMREM, component swap
scene/CameraRig.tsx   extended beat type (roll/fog/exposure/dof interpolation → channel)
lib/materials.ts      fog chunk added to the SAME onBeforeCompile pass (Trap #8)
lib/tier.ts           new flags: {terrainDetail, fogQuality: 'cards'|'cards+march'|'basic',
                      ao, dof, rocks, stars} — table in Part 5
lib/store.ts          scroll channel += { fogSigma, fogHeight, exposure, pulseT, dof }
                      (σ/height-falloff model — NOT near/far; see 4B)
```

### 4B · Uniform contract (all writes via material refs — Trap #1)

- Terrain: `uTime, uCam, uLook, uSeamPulse, uSeamAmbient, uPadGlow[6], uFogParams`
- Fog chunk (all lit materials): `uFogSigma, uHeightFalloff, uBetaExt (vec3),
  uBetaIns (vec3), uMoonDir, uFogColorBase, uFogColorMoon, uCamPos, uTime, uNoiseTex` —
  the exponential σ/height model from 2A (NEVER linear near/far — the two
  parameterisations are not interchangeable). One SHARED module-level uniforms object,
  referenced (not cloned) by every patched material; one write per frame updates all.
- Sky/moon: `uTime, uMoonDir, uVeil` (fog occlusion factor)
- SignalNetwork: `uPulseT, uAmbientPulse` (+ per-instance attributes for phase)

### 4C · Scroll → world pipeline (unchanged spine, new consumers)

```
Lenis → ScrollTrigger → scroll.target → CameraRig smoothing → scroll.t
  ├─ camera splines (pos/look) + fovAt + rollAt
  ├─ env timeline (lib/env.ts, sampled ONLY inside CameraRig's useFrame):
  │    per-beat σ/exposure/dof → scroll.{fogSigma,fogHeight,exposure,dof}
  ├─ stations: visibility windows, idle motions, retimed beat constants
  ├─ SignalNetwork: pulseT
  └─ Post: bloom focus pull, DOF at flagged beats, exposure
```

---

## PART 5 — QUALITY TIERS & BUDGETS

### 5A · Per-tier feature matrix

| System | Desktop | Laptop | Mobile | Fallback |
|---|---|---|---|---|
| DPR cap | 1.5 (PerformanceMonitor-adaptive) | 1.25 | 1.0 | 1.0 |
| Terrain grid | 256×96 (49k tris) | 192×96 (37k) | 128×64 (16k) | 96×48 (9k) |
| Rocks | ~150, BatchedMesh, det 2+3, triplanar | ~100, det 2, planar | ~60, det 2, no detail map | ≤20, InstancedMesh |
| Ridges | ring + flanks | ring | ring-lite | 1 gradient billboard |
| Fog chunk (materials) | ✓ full (height + per-channel + moon in-scatter + noise) | ✓ full | ✓ full (256² noise) | ✓ simplified (distance-only) |
| Fog cards | 8–10 + soft-particle depth | 6–8, no depth read | 3–4, slow/static noise | none |
| Raymarch fog pass | ✓ half-res 12–16 steps | — | — | — |
| Glow sprites | ✓ | ✓ | ✓ | ✓ (they carry the reveals) |
| Dust/debris/motes (3I) | 2000 + 40 debris | 1200 | 600, no debris | off |
| Idle heartbeat (invalidate) | 12fps parked | 12fps | 8fps | 8fps |
| Sky | 2K moon + normal, 1,400 stars ×2 shells, animated nebula | 2K/1K, 1,000 stars, baked nebula | 1K moon no normal, 800 stars ×1 | baked sky image on dome |
| Shadows | 1× dir 2048, scroll-gated | 1024 | none | none |
| Practicals | 5 pool | 4 | 3 | 2 |
| N8AO | Medium, full-res | Performance, halfRes | — | — |
| Bloom | mipmapBlur L7, thr 1.0 | L6 | L4–5 trimmed | — (no composer) |
| DoF | at flagged beats | at flagged beats | — | — |
| CA | ≤0.0012 | ✓ | — | — |
| Tone map | AgX (composer) | AgX | AgX | AgX via `renderer.toneMapping` — so `<Canvas flat>` is CONDITIONAL: flat only on composer tiers |
| Grade | LUT3D 33³ (or BC/HS) | BC/HS | BC/HS | — |
| Vignette/Grain | ✓ / 0.05 premult | ✓ | vignette only | CSS |
| AA | SMAA MEDIUM | SMAA LOW | FXAA | canvas AA |
| GLBs | full (KTX2 ETC1S) | full | 50%-simplified set | 50% set |
| CubeCamera hero | one-shot 128 | — | — | — |
| Frameloop | demand | demand | demand | demand |

### 5B · Frame budget (desktop @1080p·DPR1.5, 16.6ms)

Geometry (≤2 stations ~300k + env ~95k culled ≈ **≤395k tris**, ~30 draw calls) ≈ 5–7ms ·
N8AO 2–4ms · bloom ~1ms · fog raymarch 1–2ms · final merged pass ~0.7ms · SMAA ~0.7ms →
**~11–15ms**, with DoF's 1–2.5ms only at flagged beats (budgeted by disabling the
raymarch pass during DoF beats if needed). Laptop drops raymarch + halves AO ≈ fits 22ms.
VRAM: models ~17MB (KTX2) + post buffers ~60–80MB + sky ~10MB + noise/detail ~4MB.
Draw calls: stations 6–12 + env 5–8 + sky 7–9 + cards ~10 + sprites 1 (merged) ≈ **≤45**
(+8–12 depth-only caster draws DURING scroll while the gated shadow map refreshes —
`renderer.info` will show these; still under 60).

### 5C · Hard rules

- On-screen triangles < 400k at every authored beat (verify per Part 7).
- No effect mounts/unmounts mid-scroll (recompile hitch) — pools + `.enabled` only.
- Every new texture ships KTX2 (ETC1S color / UASTC normal); nothing fetches from a CDN.
- `?tier=` override must exercise every row of 5A.

---

## PART 6 — IMPLEMENTATION ORDER (phases with hard gates)

Follow strictly; each phase ends with `tsc + eslint + build` clean AND its visual gate
checked in the browser at the listed `t` positions before the next phase starts.

1. **Prep** — extend `tier.ts` (new flags; delete `floorGloss`/`cones` with their
   consumers later), `store.ts` channel fields, beat type in `world.ts` (old values
   still in place); add deps `simplex-noise` (+ `n8ao` if importing it directly);
   extend `Debug.tsx`: `__pose()` emits the FULL beat shape (roll/fog/exposure/dof
   defaults), orbit target → `[0, 1, -113]`, grid → 300u. Gate: site renders
   identically to today.
2. **Sky + Moon + Stars** (`SkyMoon.tsx`, `MOON_DIR`) — replaces the background colour.
   Includes: far plane 140→320, `camera.layers.enable(2)`, `fog:false` on ALL sky
   materials, the camera-follow sky group (2E anchor rule). Gate: establish shot at t=0
   shows moon/stars; no clipping at any t; scrims legible.
3. **World re-layout + Terrain + Rocks + Ridge** — re-author `STATIONS` to the 3A
   240u corridor (keep `port` fields alive — 1C conduit note); replace `Floor.tsx`;
   stations get pad heights; **remove FogExp2 here** (corridor runs fogless until
   Phase 4 — expected); apply a PROVISIONAL linear stretch to the old camera keys
   (`z' = z·(240/34)` on pos/look) so the site stays scrollable. Gate checked via
   `?debug=1&orbit=1` free-fly at each station (the real camera is Phase 6): no
   station floats or sinks; silhouettes read; ≤ budget tris.
4. **Atmosphere system** — fog chunk into ALL materials + cards (+ desktop march);
   `Atmosphere.tsx` rework in the same phase: cones + orbital rings deleted, dust
   re-specced per 3I. Gate: reveal grammar plays on the table approach
   (light→silhouette→rim→detail) under the provisional camera; finale zone legible.
5. **Lighting + env** — moon directional + shadow gating, practical pool (Trap #14),
   MoonEnvironment PMREM, pad contact darkening. Gate: paused frames at 5 random t
   read as lit, grounded, mostly dark.
6. **Camera re-authoring** — replace the provisional stretch with the Part 3C beats,
   authored live via `?debug=1&orbit=1` + `__pose()`; retime every Trap-#7 constant;
   rebuild `HOLD_KEY_FOR_CHAPTER` = [0.060, 0.210, 0.420, 0.635, 0.800, 0.940]
   (REDUCED_POSES throws at load if a listed t has no exact key — by design); env
   timeline live. Gate: full scroll forward AND reverse, no pops; `tsc` clean.
7. **SignalNetwork** — NOW delete `SignalConduit.tsx` + old `Beacons.tsx`, drop
   `CONDUIT_POINTS`/`port`, repoint Debug's conduit line to `SIGNAL_PATH`;
   seam/nodes/cables/beacons/pulse + finale activation. Gate: no visible "line" at any
   hold; pulse discoverable; finale reveal lands.
8. **Post + grade + recalibration** — Part 5 chain per tier (the pipeline inversion,
   Trap #15); swap `<AdaptiveDpr>` OUT for `PerformanceMonitor` (N8AO conflict);
   throttle StageMonitors repaints (≤12fps, only while ch2 active + scrolling);
   recalibrate ALL emissives + dust + monitor materials under AgX. Gate: bloom reveals
   light rather than creating it; blacks stay black; grade consistent.
9. **UI retune** — scrims/chips/rail per 3H INCLUDING the composition flip
   (`right` set `{2,4}` → `{1,3}`). Gate: every copy window still equals its chapter
   range (re-run the numeric check from BUILD-NOTES §9).
10. **Perf + assets + tiers** — KTX2 pipeline: install KTX-Software (`toktx`), run
    `gltf-transform etc1s` (basecolor; quality 200–255, watch dark-gradient banding)
    / `uastc` (normals) + `meshopt` + `quantize` over the six GLBs; produce the
    50%-simplified mobile set (`gltf-transform simplify --ratio 0.5`); **copy the basis
    transcoder into `/public/basis/` + `ktx2Loader.setTranscoderPath('/basis/')`**
    (5C bans CDN fetches — drei's default transcoder path is a CDN); wire
    `frameloop="demand"` + `invalidate()` from Lenis/GSAP/pointer-parallax + the
    12fps idle heartbeat (suspended when tab hidden); reduced-motion pass against the
    NEW poses; `Fallback.tsx` rebuilt — palette AND motifs (its perspective grid and
    literal signal line violate the art direction). Gate: Part 7 protocol.
11. **Polish loop** — three passes minimum over the brief's §38 questions, verbatim:
    does the camera have mass and motivation? does the world feel enormous with
    readable fg/mid/bg? does fog occupy space and reveal naturally? does green come
    from sources, with most areas dark? do the machines feel grounded, massive,
    belonging? does it feel like travel, not sections? is the Signal mysterious,
    guiding without a neon road? does the crane-out genuinely reveal something the
    viewer didn't understand before?
12. **Docs** — update `BUILD-NOTES.md` (architecture, deviations, new traps found).

---

## PART 7 — VERIFICATION & QA

### Perf protocol (REAL browser only — Trap #10)
- Chrome + one other engine, DPR-capped; FPS meter at t = 0, 0.21, 0.42, 0.545
  (fly-through), 0.8, 0.94 (crane) while actively scrolling.
- Budgets: on-screen tris < 400k (report per shot), draw calls < 60, 60fps desktop /
  45fps laptop tier; hero interactive < 3s warm.
- `renderer.info` snapshot before/after a full journey — geometry/texture counts must
  return to baseline (no leaks from the new systems).

### The pause test (brief §39)
At 8 random `t` values, hide the DOM layer
(`document.querySelector('.dom-layer').style.display='none'`) and screenshot. Each frame
must pass: readable composition, believable light direction, fog with depth, no floating
meshes, no raw grid, no neon-tube signal.

### Regression checklist
- Reverse scroll reconstructs every state (hold-easing invariant).
- Reduced-motion: static poses per chapter correct against the NEW world positions
  (HOLD_KEY_FOR_CHAPTER = [0.060, 0.210, 0.420, 0.635, 0.800, 0.940]).
- `?tier=mobile` and `fallback` both render; fallback palette updated.
- Drawer/SEO layer untouched: 191 drawer bullets (234 SSR list items incl. chips and
  engine stages), 1×h1 / 5×h2 / 18×h3.
- No console warnings; `tsc`, `eslint --max-warnings=0`, `npm run build` all clean.

### Open items (carried from the original build — still true)
- Portfolio reels (`/public/reels` + `REEL_SOURCES` swap), real counter figures, copy
  review (the 191 bullets are first-draft), Tripo Part Segmentation for any future
  per-part choreography.
- New with this overhaul: author the `.cube` grade LUT (DaVinci Resolve, free); bake the
  moon normal map from LOLA displacement (Blender, offline, one-time); download + credit
  NASA SVS Moon Kit; pull 1–2 Poly Haven CC0 regolith normal maps.

---

## PART 8 — SOURCE INDEX (research provenance)

Fog/atmosphere: [iq — fog](https://iquilezles.org/articles/fog/) · [Codrops — The Sleepers](https://tympanus.net/codrops/2026/07/10/the-sleepers-creating-an-atmospheric-webgl-experience-with-lightweight-techniques/) · [three-volumetric-pass](https://github.com/Ameobea/three-volumetric-pass) · [three-good-godrays](https://github.com/Ameobea/three-good-godrays) · [pmndrs GodRays off-axis limits](https://github.com/pmndrs/postprocessing/discussions/435) · [three #19377 (program cache)](https://github.com/mrdoob/three.js/issues/19377)
Terrain/rocks: [iq — biplanar mapping](https://iquilezles.org/articles/biplanar/) · [Don McCurdy — web texture formats](https://www.donmccurdy.com/2024/02/11/web-texture-formats/) · [drei ContactShadows cost](https://drei.docs.pmnd.rs/staging/contact-shadows) · [terrain skirts](https://thedemonthrone.ca/projects/rendering-terrain/rendering-terrain-part-15-skirts-and-other-additions/) · [procedural rocks thread](https://discourse.threejs.org/t/procedural-rock-generation/6107)
Lighting/AO/reflections: [n8ao README](https://github.com/N8python/n8ao/blob/master/README.md) · [react-postprocessing #280 (AdaptiveDpr conflict)](https://github.com/pmndrs/react-postprocessing/issues/280) · [Valve/Quake lightstyles — Zucconi](https://www.alanzucconi.com/2021/06/15/valve-flickering-lights/) · [RoomEnvironment source (fromScene pattern)](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/environments/RoomEnvironment.js) · [drei Environment/Lightformer](https://drei.docs.pmnd.rs/staging/environment) · [light-count recompile discussion](https://discourse.threejs.org/t/dynamically-disable-enable-lights-at-runtime/6545)
Camera/cases: [Codrops — cinematic GSAP scroll (2025)](https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/) · [Codrops — Blender camera path (2026)](https://tympanus.net/codrops/2026/07/07/building-a-scroll-driven-3d-gallery-using-a-blender-camera-path-with-three-js-and-gsap/) · [DEPT — cinematic camera path](https://www.deptagency.com/en-nl/insight/coding-a-cinematic-camera-path/) · [Igloo Inc case study](https://www.awwwards.com/igloo-inc-case-study.html) · [Codrops — Theatre.js fly-through](https://tympanus.net/codrops/2023/02/14/animate-a-camera-fly-through-on-scroll-using-theatre-js-and-react-three-fiber/)
Sky/moon: [NASA CGI Moon Kit (SVS 4720)](https://svs.gsfc.nasa.gov/4720) · [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) · [Poly Haven lunar sets (CC0)](https://polyhaven.com/a/moon_01) · [skydome pattern](https://www.ianww.com/blog/2014/02/17/making-a-skydome-in-three-dot-js) · [starfield case study](https://www.richardfu.net/solving-starfield-perspective-distortion-in-3d-space-a-three-js-case-study/)
Post/perf: [pmndrs postprocessing](https://github.com/pmndrs/postprocessing) · [antialiasing wiki (MSAA×depth effects)](https://github.com/pmndrs/postprocessing/wiki/Antialiasing) · [effect merging wiki](https://github.com/pmndrs/postprocessing/wiki/Effect-Merging) · [tone mapping overview](https://discourse.threejs.org/t/tone-mapping-overview/75204) · [Neutral crushes shadows (model-viewer #4825)](https://github.com/google/model-viewer/issues/4825) · [KTX artist guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md) · [R3F scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
