# The Signal Line — build notes

Implementation of `content-page-3d-plan.md`. Next.js 16 (App Router) + React Three Fiber v9
+ drei v10 + @react-three/postprocessing + GSAP ScrollTrigger + Lenis + zustand, per §8.

```bash
npm run dev
```

Then <http://localhost:3000>.

| Flag | Effect |
|---|---|
| `?debug=1` | Camera position/look splines, keyframe markers, conduit path, station bounds |
| `?debug=1&orbit=1` | Hands the camera to OrbitControls; `__pose()` in the console prints a paste-ready `CAMERA_KEYS` row |
| `?tier=desktop\|laptop\|mobile\|fallback` | Force a quality tier |

---

## Where the build departs from the plan, and why

Everything below is a deliberate change, not an omission. The plan's intent is preserved
in each case; the mechanism differs because the stated one did not survive contact with
the actual assets or the actual maths.

### 1. Emissives are derived in the shader, not baked by `emissive.py`

**The plan (§9.2/§9.3)** runs `emissive.py` offline to bake an emissive map into each GLB.

**What shipped:** the six `*_web.glb` files in the delivery **never had that step run**.
Inspecting them shows `material.emissiveTexture: None`, and they still carry the flat
normal map and the blotchy roughness/metal map that §1.3 says to drop.

Rather than re-run the offline pipeline, `src/lib/materials.ts` ports the *exact* mask
from `emissive.py` into the fragment shader via `onBeforeCompile`:

```
green = (G - max(R,B) > 0.07) && (value > 0.22)
white = (value > 0.80) && (saturation < 0.12)
mask  = clamp(green + 0.35 * white, 0, 1)
emissive = basecolor * mask * tint(0.62, 1.0, 0.70) * strength
```

Three reasons this is better here, not just faster:

- No second 2K texture per station — roughly 16 MB of VRAM saved each.
- `uStrength` is a uniform, so the table's breathing, the booth's flash and the machine's
  hub→panel ignition are free. Baked maps would have needed a second material per state.
- `uSeq` gives the machine its ignition gradient with no extra draw call.

The dead normal and RM maps are disposed at load, so 6 models ship 6 textures, not 18.

**If you want the baked pipeline anyway:** run §9.2 against the originals and delete the
`onBeforeCompile` block. The calibrated strengths in `src/lib/world.ts` transfer unchanged.

### 2. Fog density 0.038, not 0.14

`FogExp2` is `exp(-(density·depth)²)`. At the plan's 0.14, a station 10 units out is 86%
fogged and one 25 units out is at 0.2% visibility — which makes §5's finale crane, whose
entire job is to show all six machines at once, mathematically impossible. 0.038 keeps
"back stations dissolve" while leaving the reveal legible. The crane lifts it a further
72%.

### 3. The key light travels

**The plan (§2.2)** specifies a fixed key SpotLight at `(2.5, 4, 2.5)`. That lights the
hero and nothing else — the line is 34 units long, so every station from chapter 1 on
would read as a silhouette lit only by its own panels.

`TravellingRig` keeps the plan's three-point character (white key, acid-green rim, cool
fill) but anchors the key and fill to the camera's **live look target**, published on the
`scroll` channel by `CameraRig`. Whatever the shot is on is always keyed. `FinaleLift`
then raises the global rim/fill/ambient through the crane, because at that point there
are six subjects, not one.

### 4. Hold easing is per-segment, not a global CDF

The first implementation redistributed `t` through a global cumulative weight function.
It slowed the camera near holds correctly — and moved every keyframe off its authored
time, so `t = 0.28` arrived at the stage instead of the drafting table. `remapHold` now
eases only *within* each segment, so `remapHold(k.t) === k.t` for every key by
construction and the §5 table stays authoritative.

Related: the splines are sampled with `getPoint` (index space), never `getPointAt`
(arc-length space). The §5 keys are spaced by narrative beat, not by distance.

### 5. Chapter blocks are `position: sticky`, not ScrollTrigger-pinned

Same result, no pin-spacer injected into the scroll length, and it survives Lenis and
resize without a refresh. Each section's **height is its share of the master `t`**
(`sectionHeight()` in `ChapterBlock.tsx`), so a chapter's copy is on screen for exactly
as long as its camera beat plays. Sizing sections by eye let the hero title scroll away
a third of the way through the hero shot.

### 6. The finale is a side-on aerial, plus beacons

Looking *along* the line put five machines behind the sixth. From `+X` the whole S-curve
spreads across the frame. Even then, at a 25–35 unit standoff each machine subtends only
a few degrees and its lit panels fall below a pixel — so `Beacons.tsx` raises a
billboarded light column at each station as the crane starts, firing in Signal order.
The line reads as a *line* even when the machines are small.

### 7. The procedural iris is gone; the focus pull carries the gesture instead

**The plan (§6, camera-rig row)** asks for "a procedural iris ring (12 blade planes built
in code, not in the GLB)" in front of the lens, rotating with scroll velocity.

It was built and then removed. Two problems, both rooted in the asset:

- **It could not be placed.** The blades have to sit concentric with the lens barrel, and
  the barrel's position cannot be determined from this mesh. §1.3 already says why: every
  model is a patchwork of hundreds of disconnected micro-islands, so neither connectivity,
  X-slicing, circular-symmetry fitting, nor surface raycasting isolates the barrel from
  the matte-box frame around it. Every method tried returned the frame or the rail base.
  A hand-tuned guess left the ring floating in the void beside the lens.
- **It occluded the best feature.** Twelve dark blade planes in front of a lens that is
  only a few hundred pixels across read as a ragged pinwheel over the model's strongest
  detail, at every angle the camera passes through.

The plan's *intent* — "the first thing the page does on scroll is a physical camera
gesture" — is now delivered through the lens the model already has. `Post.tsx` drives the
bloom's intensity and its mipmap-blur radius (0.6 → 0.9, the plan's own numbers) off
scroll velocity, so the hero's lens breathes as the dolly accelerates and settles on the
holds. It is anchored to nothing, so it cannot float or occlude.

The aperture-iris **loader** (§7) is untouched — that one is DOM/SVG, it works, and it is
where the iris gesture actually reads.

**If you want the 3D iris back:** it needs the barrel as an independent part, which is
what §6's optional Tripo Part Segmentation pass produces. With the barrel as its own node,
the ring parents to it and the placement problem disappears.

### 8. No planar reflector; the floor is glossy in its own shader

**The plan (§2.2)** puts a low-res `MeshReflectorMaterial` plane under the hero.

It shipped as a 16×16 quad on a 110×110 floor, and its edge drew a hard rectangular seam
straight across the ground. It also washed out the survey grid underneath it and cost a
second scene render every frame.

Removed. The floor shader now does the job itself:

- **Reflection streaks.** Each station gets an anisotropic smear running from its base
  along the station→camera direction — tight across, long toward the viewer. That is what
  a polished floor actually does to a bright object, and it costs a few ALU ops in a
  shader that was already running. No seam, because it lives in the same 110×110 plane.
- **Grazing gloss** replaces the old `fract()` stripe "sheen", which read as banding.
- **A key-light pool** at the camera's live look target. The floor is a raw
  `ShaderMaterial` and so receives no scene lighting at all; without this the near field
  rendered as literal `uVoid` black once the reflector that had been standing in for it
  was gone.

Because it is no longer a second render target, the gloss is on for every tier except
`fallback`, where the plan could only afford it on desktop.

### 9. Scroll geometry: half-viewport pads, and holds at chapter midpoints

Two bugs in how the DOM copy lined up with the camera, both found by measuring rather
than by eye.

**The copy windows were half a viewport early.** Section heights were a fraction of the
document height, but scroll progress is measured against the *scrollable* range
(`docH - vh`), and a sticky block is centred when the viewport CENTRE is inside its
section — and the centre leads the scroll position by `vh/2`. Every chapter's copy window
therefore sat ~5.6% ahead of its own camera range, and chapter 1's hold at `t = 0.28`
landed at 0.278, just past the end of its window: the dolly parked on the drafting table
while the drafting table's headline was already sliding out of frame.

Fixed by padding both ends of the page with `vh/2` and sizing sections against the
scrollable range, which makes the copy-centred window *exactly* equal to the chapter's
`t` range. Verified: all six now read `[0, 0.12] [0.12, 0.30] [0.30, 0.55] [0.55, 0.72]
[0.72, 0.88] [0.88, 1.0]`.

**The holds sat too late inside their chapters.** §5 puts several at ~89% through their
range (0.28 of 0.12–0.30, 0.70 of 0.55–0.72, 0.86 of 0.72–0.88). A sticky block is only
*fully* centred while the centre is at least half the block's height inside the section,
so parking there still caught the copy mid-exit. The holds now sit at their chapter
midpoints — 0.21, 0.42, 0.635, 0.80, 0.94 — and the beat-keyed constants that referenced
them (booth flash, machine ignition ramp, stage-monitor fades) were retimed to match.

### 10. Per-key FOV

`CameraKey.fov` interpolates between keys. The crane needs a wide lens (60°) to hold the
line; the station holds want a longer one (42–46°) so the machines are not distorted.

### 11. Portrait compensation

`camera.fov` is vertical, so a 9:19.5 phone sees far less horizontally than the 16:9 the
§5 poses were framed for. `framingFor()` dollies the camera back along its view vector
and widens modestly, both capped — rather than blowing the FOV out to ~110°, which would
distort the machines.

### 12. `RoomEnvironment`, not drei's `<Environment preset>`

The preset pulls a ~1 MB HDR from a CDN. It blocked first paint and added a third-party
dependency to time-to-interactive. `RoomEnvironment` PMREM'd at 0.35 is the plan's own
first choice (§2.2) and ships in three.

---

## Two bugs worth knowing about

**Uniform writes must go through a material ref.** `THREE.ShaderMaterial` deep-clones
whatever you pass as `uniforms`, so the object built in `useMemo` is *not* the object the
GPU reads. Mutating it from `useFrame` silently does nothing: the shader compiles,
renders its `t = 0` state, and never moves again. This had every custom shader — the
Signal pulse, the floor ripples, the dust drift, the cone breathing — frozen while
looking superficially fine. Every animated uniform now writes through `mat.current.uniforms`.

**`totalEmissiveRadiance` is seeded from `material.emissive`.** Leaving it white made
every surface glow at full intensity, not just the derived panels. It must be black.

---

## Performance

Measured in-page (`renderer.info` + geometry walk):

| Metric | Measured | Plan budget (§10) |
|---|---|---|
| Total triangles, all 6 stations | 951k | 938k |
| On-screen triangles (hero) | ~308k | < 400k |
| Unique textures | 6 basecolor (normal + RM disposed) | — |
| Texture VRAM (2K WebP, RGBA) | ~130 MB | < 150 MB |
| Transfer, all models | 11.7 MB | < 30 MB |

**Frame rate is not verified.** The automation surface used to build this throttles
`requestAnimationFrame` during tool calls, so every fps sample it produced (~1.6) is an
artefact of the harness, not the page. Open it in a real browser and check. If it needs
headroom, the plan's KTX2 step (§9.2) is the first lever — it cuts texture VRAM 4–6× and
removes the WebP decode stall; nothing in this build depends on the texture format.

---

## Still open (from §12)

- **Portfolio reels.** `StageMonitors.tsx` runs a procedural playback surface —
  timecode, safe-area marks, live waveform, scrubbing playhead. Drop files into
  `/public/reels` and set `REEL_SOURCES` to swap every monitor to a lazy `VideoTexture`;
  nothing else changes.
- **Counters.** The four figures in chapter 4 are illustrative and labelled as such on
  the page. Set `COUNTERS_ARE_ILLUSTRATIVE = false` in `src/lib/chapters.ts` once real
  numbers land.
- **Service copy.** The plan references ~250 bullets across §7.1–7.18 that were not in
  the package. All 18 areas are written out in `src/lib/chapters.ts` as a first draft
  from the area titles — review before launch.
- **Reference page / design.** Not received. The type scale, nav and grid in the DOM
  layer are the plan's §7 spec, not a match to an existing page.
- **Poster fallback.** `Fallback.tsx` is a CSS-only backdrop, not the per-chapter poster
  PNGs §7 describes. Rendering those needs the scene running headless.
- **Tripo Part Segmentation** (§6, optional) — not run. Canopy counter-rotation, per-ring
  array speeds and the Cyphernaut turning his head all need it.

## Excluded models

Per §1.2, four of the ten are unused: `futuristic_control_desk`, `futuristic_space_station`,
`futuristic_control_table`, `sci-fi_control_console`. They are not in `public/models`.

## Where things live

```
src/lib/world.ts        Station transforms, conduit path, CAMERA_KEYS (§4, §5)
src/lib/materials.ts    Derived-emissive shader patch + disposal (§1.3, §9.3)
src/lib/chapters.ts     All copy, chips, and the ~250 drawer bullets (§3, §7)
src/lib/tier.ts         Capability probe and per-tier budgets (§10)
src/lib/store.ts        zustand store + the non-reactive per-frame `scroll` channel
src/components/scene/   Canvas, camera, stations, conduit, floor, atmosphere, post
src/components/dom/     Loader, nav, rail, cursor, chapter blocks, drawer, lightbox
```

---

# The overhaul (MASTER-OVERHAUL.md)

The build above described a 34-unit room. What follows replaced it with a 240-unit lunar
corridor. The camera architecture, the scroll pipeline and the chapter geometry survived
intact; almost everything they were pointed at did not.

## What the overhaul changed

| Was | Is |
|---|---|
| `Floor.tsx` — flat 110×110 shader plane with a grid | `Terrain.tsx` — CPU-displaced 170×330 corridor sheet, 50k tris, craters + massifs |
| `scene.fog` FogExp2 | `lib/fog.ts` — analytic height fog patched into every lit material, `scene.fog` null forever |
| `SignalConduit.tsx` — a glowing tube down the corridor | `SignalNetwork.tsx` — buried seam, node pucks, cables, distant beacons |
| Background colour | `Sky.tsx` — dome, nebula, two star shells, a cratered moon on its own light layer |
| Spot + two points, `RoomEnvironment` | `Lighting.tsx` — one moon key, a fixed practical pool, a PMREM of a purpose-built dark sky |
| ACES on the renderer | AgX at the END of an HDR composer chain |
| 17 stretched camera keys | 26 authored beats, resolved against the terrain |

## New notes

### 13. Heights are authored above the ground, not in world Y

`world.ts` states every beat as "three metres up, fourteen out from the rig, favouring its
left shoulder"; `cameraPath.ts` resolves that against `heightAt(x, z)`. The corridor runs
across thirty units of relief, so an absolute `y` that frames a machine at z = −60 puts the
lens underground at z = −100 — and the whole table goes stale the moment the terrain noise
is retuned, which is exactly what happened to the first version of it.

Two different guarantees are involved and both are needed. The resolver preserves the
AUTHORED framing. `groundCamera` in `terrain.ts` is the runtime floor, catching the places
the interpolated spline dips between two perfectly legal beats — a Catmull-Rom curve does
not know there is a ridge between its control points.

### 14. Station shots are computed, not typed

`shotAt(x, z, {az, dist, camH, lookH, fov, thirds})` puts the camera on a bearing around
the subject and then offsets the LOOK TARGET sideways to push the subject off-centre. So
"figure left third, copy right" is `thirds: 0.33`, and it stays true if the station moves
or the lens changes. `fitDist(width, frac, fov)` does the same for distance: author the
fraction of frame the machine should fill, and the camera works out where to stand.

This matters more than it sounds. The machines turn out to be 3.5–4.4 units wide and
0.9–3.5 tall. The first pass guessed distances of 13–16 units and look heights of 2.0–2.6,
which put every camera roughly twice as far out as it should have been, aiming a metre over
the top of every machine. Measuring the GLB bounds and solving for them fixed all six holds
at once.

### 15. The finale crane was solved, not composed

The reveal has one hard requirement — all six machines inside the frame — and whether a
given crane satisfies it is a projection question. Sweeping camera position, look target
and focal length against the six station positions rejected every pose that framed the line
from the front (the near stations fall off the bottom of the frame) and landed on one
behind the array, ninety metres up, looking back along the line the visitor just travelled.
That is why the crane turns back rather than pulling straight out.

### 16. Fog scatters isotropically AND forward

The brief's rule is that green comes from sources, never from a filter, and the mechanism
is a moon-directional in-scatter term. Expressed as `mix(base, moon, pow(dot(rd, moonDir),
n))` it cannot work: the moon sits nearly straight down the corridor, so any exponent low
enough to make the lobe visible tints the entire frame emerald, and any exponent high
enough to stop that kills the effect. Real media scatter in every direction and merely
scatter HARDEST toward the light, so it is `base * (0.6 + 0.4 * md) + moon * pow(md, 6)`.
Turn away from the moon and the air goes grey; look into it and it glows.

### 17. Fog banks must never be darker than the ground

The fog cards were first painted with `PALETTE.fogBase`, which is the colour of AIR and
very nearly black. Over dark regolith a card like that does not merely fail to show — it
renders DARKER than the terrain behind it and reads as a rectangular hole cut in the world.
A bank is a lit object.

## New traps found (beyond the sixteen in the master doc)

1. **`<primitive object={effect}>` silently kills the whole composer.** EffectComposer
   reads its children through its own reconciler pass to group them into EffectPasses, and
   a raw primitive is not an effect element as far as that pass is concerned. The result is
   a completely black frame with no error anywhere — not a warning, not a shader log.
   Custom effects go through `wrapEffect`.
2. **`instanceColor` multiplies diffuse, not emissive.** An `InstancedMesh` whose per-node
   brightness is meant to come from `setColorAt` will render every instance identically lit
   from the material's own emissive. Route it explicitly: read `vColor.rgb` in a patched
   `<emissivemap_fragment>`. (And it is `vec4` in three 0.185, not `vec3`.)
3. **`patch` is a reserved word in GLSL ES 3.0.** It compiles fine in your head.
4. **Detail normals stripe at grazing angles.** A ground plane seen at a grazing angle needs
   far more anisotropy than the 16 the hardware offers, so distant detail texels alias into
   streaks radiating toward the vanishing point. Fade the detail normal out with distance;
   amplitude matters too (0.85 tilts a flat ground normal by up to 40°, which is not fine
   relief but noise).
5. **A shadow camera must be sized for the SHADOW, not the caster.** `MOON_DIR` sits at 17°
   of elevation, so a shadow runs about 3.2× the height of whatever casts it. At the ±13
   the ortho box started at, every shadow was sliced off mid-length against the frustum and
   the cut showed as a hard-edged dark rectangle sliding across the regolith with the
   camera.
6. **Craters must not stack.** Summing overlapping bowls looks reasonable until the field is
   dense enough to matter; 220 craters summed into twenty-unit walls that buried the camera.
   Deepest-bowl / highest-rim is both bounded and the more honest geology.
7. **Order matters between pads and the corridor grading.** A pad is an assertion — "the
   ground here is exactly `p.y`" — so it must be applied LAST. Running the grading after it
   drags the flattened shelf back toward the broad swell, and all six stations float about
   a unit above their own pads.
8. **Scatter ranges have to match the sheet.** Both the crater field and the boulder scatter
   were spread over ±150 in x on a ±85 sheet: more than half of each landed on ground that
   does not exist, leaving the visible corridor nearly uncratered and four boulders in ten
   stranded off the edge of the world.
9. **Ridge rings must clear the terrain's CORNER radius.** A ring at r = 118 inside a sheet
   whose corners reach 212 carves long parallel gashes clean across the travelled corridor.
10. **Nulling a shared uniform on unmount is the dispose-the-live-value trap again.**
    StrictMode unmounts between its two mounts; clearing `uFogNoise` there leaves every
    already-compiled material sampling nothing.

## Still open

- **KTX2 texture pipeline (Phase 10).** Not done: it needs KTX-Software's `toktx` binary
  installed at system level, which was out of scope to install unattended. The six GLBs are
  12 MB total on disk (already WebP-in-GLB), so the win is smaller than the master doc's
  estimate assumed — but VRAM is still uncompressed at runtime and this remains the single
  largest memory item.
- **Mobile GLB set** (`gltf-transform simplify --ratio 0.5`) — same blocker.
- **Desktop raymarched fog pass** (2A's "garnish"). The chunk and the cards carry the look;
  the half-res march was not needed to reach it.
- **Soft-particle depth reads on fog cards.** The depth texture now exists (N8AO's normal
  pass), so this is wiring rather than research.
- **LUT3DEffect grade.** `HueSaturation` + `BrightnessContrast` is doing the job; a `.cube`
  would be a refinement, not a fix.
