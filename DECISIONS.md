# DECISIONS.md

Build log for the green hero. Records every place `HERO_SPEC.md` and the local
mirror disagreed, every value the spec asked for that exists nowhere in the
mirror, and the judgement calls behind the placeholders.

Ground truth is `/reference` (git-ignored, 403'd by the dev server, nothing from
it ships). Where the spec and the mirror disagree on a *measured value*, the
mirror wins; where the spec gives an explicit *design instruction* that
contradicts the mirror's implementation, the spec wins. Both cases are listed.

---

## Run it

```bash
python qa/serve.py 8123
```

Then open <http://127.0.0.1:8123/>. QA captures:

```bash
node qa/shoot.mjs http://127.0.0.1:8123/ qa/hero-1440.png 1440 900 9000
```

`qa/shoot.mjs` drives headless Chrome over CDP and waits real wall-clock time
(`--virtual-time-budget` does not advance `performance.now()`, which is what the
intro is clocked on, so it captures frame zero). Optional flags: `--eval "<js>"`
to interact before the shot, `--print` to dump the eval result, `--after <ms>`,
`--scrollbars`, and `-` as the output path for a probe-only run.

---

## 1 · Mirror wins over spec

| # | Spec says | Mirror says | Shipped |
|---|---|---|---|
| 1 | Hero = `100vh` | `#scene3d{left:0;top:-5px;width:1024px;height:629px}` — a fixed design-px box | 629px. See §4 for the consequence at 390. |
| 2 | Floor sized from the frustum: `visW = 2·tan(fov/2)·\|camPos\|·aspect` | Floor is a fixed `R = 5`; that `visW` formula is used for the **rig nudge**, not the floor | `R = 5`, plus the rig nudge of `visW · 68 / 1024` along the camera-right axis |
| 3 | Parallax = `rig.rotation.x` and `rig.rotation.y` only | Also `rig.position.y += (sc*0.0028 - rig.position.y) * 0.07` | All three terms |
| 4 | (unspecified smoothing) | `msXs += (msX - msXs) * 0.046` | 0.046 |
| 5 | Minimap labels ~8px | `#miniMap a{font-size:10px;letter-spacing:.6px}` | 10px |
| 6 | Brand mark grey `#a2a2a2`, tagline "slightly lighter grey" | Mark `#818181`, tagline `#242424` — the tagline is *darker*, not lighter | Mirror values |
| 7 | Three ~34px circular badges | `.icons` is a 94×31 strip → three ~31px circles | 31px, in a 94×31 strip |
| 8 | Stamp ~120px | `7.15vw × 7.66vw` (= 120px at a ~1680 viewport, which is where the spec was measured) | The vw values |
| 9 | (not mentioned) | Neon ring pulses: `opacity = 0.2 + pulse*0.25`, `pulse = 0.5 + sin(t*0.002)*0.3` | Included |
| 10 | (not mentioned) | 1px scanline veil over the canvas, 6px travel per 1.1s | Included |
| 11 | "primary = the front screen, preload it" | The intro camera starts on **s3** (the *left* screen) and s3 is the preload gate | s3, per the mirror. Placeholder `screen-c.mp4` is mapped to it. |
| 12 | (not mentioned) | `camera.position.set(-2.2, 1.9, -1.8)` before the intro overrides it | Included |
| 13 | "OrbitControls with polar clamps" | `rotateSpeed 0.4`, `dampingFactor 0.08`, polar `1.35–1.65`, no zoom/pan, `touchAction: pan-y` | All of it |

## 2 · Spec wins over mirror

These are explicit design instructions, not measurements.

1. **INVERT SITE.** The mirror flips the theme with a full-viewport
   `backdrop-filter: invert(1) hue-rotate(45deg) saturate(1.85) …`, which does
   invert the canvas. Spec §6 forbids that. Shipped instead: DOM neutrals swap
   via CSS custom properties, and the WebGL line/accent materials get a shared
   `uTheme` uniform injected through `onBeforeCompile` at the `<color_fragment>`
   include, lerping green → paper white. The canvas is never CSS-inverted.
2. **Row-glitch tears.** The mirror defines the tear shader (`davidPass`) but
   never adds it to the composer — it is dead code there. Spec §5 requires the
   tears, so the tear math is folded into the night-vision pass itself rather
   than added as a seventh pass. Same math, one less full-screen pass.
3. **Button label.** Relabelled `THERMAL EFFECT` → `NIGHT VISION`. Spec §3 asked
   for a choice and a log entry: the green build's ramp is a night-vision ramp,
   and keeping "thermal" would name the effect wrongly.
4. **Post chain is exactly six passes.** The mirror also carries `warpPass`
   (hover lens) and `psPass` (Powershot ISP emulation) in the composer with
   `enabled = false`. Spec §4/§7 mandate six. Both dropped rather than shipped
   disabled.
5. **Mobile.** The mirror has a whole separate `gb-mobile` layout (scene 1000px
   tall, chrome repositioned, `canvas{transform:scale(1.2)}`). Spec §3 says
   coarse-pointer devices rewrite the viewport meta to `width=1024` and get the
   desktop composition scaled. Followed the spec; the mirror's mobile redesign
   is deliberately **not** reproduced.

## 3 · Values that exist nowhere — judgement calls

1. **Mint-white hot tier `#b8ffcc`.** §2 lists it, but the original floor is a
   single-tier red with no hot core. Added as a second ring line at `y + 0.004`,
   opacity `0.08 → 0.20`, pulsing in step with the main ring.
2. **Floor line colour.** The mirror's floor lines are `#ff3b3b`, which sits
   between §2's `#ff0000` and `#ff2b2b` rows. Mapped to the signal accent
   `#19e65a`.
3. **The "thin green tick at the screen edge"** (§3, top-right cluster) is the
   styled scrollbar thumb — the mirror sets `scrollbar-color:#ff0000 #000` and a
   10px red `::-webkit-scrollbar-thumb`. Confirmed by capturing the live hero
   with scrollbars shown (`reference/qa/live-topright.png`). The scrollbar is
   styled green here, but **a hero-only page has no scroll range, so no thumb
   renders.** Not faked.
4. **`#thermalHint`** is styled in the mirror but has no markup — a dead rule.
   Not reproduced.
5. **Scroll parallax is inert.** The formula is wired exactly as the mirror has
   it, but `scrollY` is always 0 in a hero-only page. Mouse parallax carries the
   interaction; verified by A/B capture (mean frame delta 2.48 with the pointer
   swept left→right, against 0.74 for a same-position control).
6. **Minimap.** All six labels render, `MAIN` is the active state, and the links
   are inert — their targets are below the fold and out of scope. The links were
   given `background: var(--stage)`, which is invisible on the black stage and
   turns them into legible paper chips when inverted.
7. **Invert rule.** Chrome that carries its own stage-coloured chip flips with
   the theme; art drawn straight onto the 3D stage (the stamp) keeps the
   dark-stage palette, because the stage itself never inverts. Without this the
   icon strip and the minimap disappear in the flipped theme.
8. **Music** is a silent stub pointed at `assets-final/music-loop.mp3`. The
   mirror streams a third-party track from a GitHub raw URL; not reproduced.
9. **Preloader.** The mirror's is a full-site loader (canvas terminal, big %
   readout) — site chrome beyond the hero. Reduced to one accent ring inside
   `#scene3d`.

## 4 · Known consequence: the 390 viewport

`#scene3d` is a fixed 1024 × 629 design-px box (decision 1·1). At 1024 and 1440
that is ~100vh and the composition is identical to the live hero. At 390 the
scaled hero is 390 × 240 and the rest of the viewport is black stage.

A real phone reaches the same result by the other route: coarse pointer →
viewport meta `width=1024` → `s = 1` → the full 1024-wide composition mapped
down to the 390px screen. That is literally what "phones get the desktop
composition scaled" produces.

Scaling the hero to a true `100vh` at 390 would mean a portrait camera aspect
(0.46 against the design 1.63), which re-frames the 3D entirely — the one thing
§9 acceptance forbids. Flagging rather than silently re-framing: if a filled
phone viewport matters more than composition parity, the fix is the mirror's own
approach — a separate mobile framing (taller scene box, canvas overscaled) — and
that is a design decision, not a build one.

## 5 · Placeholders (all swap out via `/assets-final/`)

| Slot | Placeholder | Swap trigger |
|---|---|---|
| `monitor-rig.glb` | 34 boxes from the measured node bounds (`js/rig-bounds.js`) + 4 housings oriented to the screen planes. ~464 triangles. | GLTF loads → placeholder never builds |
| `screen-a..d.mp4` | free Pexels stock clips, then ffmpeg-generated loops offline (see 5.1) | Per-video `error` walks the chain; final wins |
| `display.otf` | `local('Impact')` → `Haettenschweiler` → `Arial Narrow Bold` | `@font-face` src list; final is first |
| `music-loop.mp3` | silent (play rejects, UI still runs) | drop the file in |
| logo / stamp / 3 badge icons / email / brand / tagline | inline SVG line art and `[CONTENT SLOT]` copy | hand-swap in `index.html` |

### 5.1 · Screen footage: free stock, three-step chain

Each screen resolves in order — **`assets-final/screen-X.mp4` → free stock URL →
local procedural loop**. The last step is offline-proof, so a blocked, rate-limited
or renamed CDN never blocks the build. Verified by pointing the stock URLs at a
dead host: all four screens fell back to the local loops with no errors.

Source is **Pexels** (`videos.pexels.com`). Two constraints drove that choice,
and most free-stock CDNs fail at least one:

- **CORS is mandatory.** A cross-origin video without
  `Access-Control-Allow-Origin` throws a `SecurityError` on WebGL texture
  upload — the screens would go black, not just uncredited. Probed: Pexels
  sends it; `test-videos.co.uk` does not; Google's `gtv-videos-bucket`,
  Mixkit and Coverr all 403/405 on direct requests.
- **Size.** §7 budgets 720p ≤5MB per screen. The chosen SD clips are
  0.35–3.0MB each.

Licence: the Pexels licence is free for commercial use with no attribution
required. The four clips were picked at random from fourteen verified URLs; any
can be swapped in `HERO_ASSETS.stock` without touching the scene code.

**Stock footage is graded onto the §2 tiers.** Arbitrary footage would drop
foreign hues into a viewport whose whole rule is *green is the only emotional
colour*. So the screen material remaps luminance through the same ramp the
night-vision pass uses (`GREEN_RAMP`, defined once and shared) — real footage
detail survives, the palette holds, and any clip can be dropped in without
grading it by hand first. `HERO_ASSETS.screenGrade: 0` gives raw footage colour.

**The reference model has no `SCREEN_1..4` named quads.** Spec §8 assumes them;
the actual rig is a hanging mast, four articulated arms, a cable bundle and four
monitor housings, with the screens as four *independent* video planes positioned
in script. The final GLB should still ship named quads per §8 — but the loader
does not depend on them, because the video planes are placed independently, as
in the original.

Measured normalisation (what the scene applies to any loaded model, and what
`rig-bounds.js` is already baked through):

```
world = (0.052, 0.44, -0.098) + (0.17505, 0.21006, 0.17505) · local
footprint 1.92 × 1.42 × 1.66      (raw gltf diagonal 15.9956 → 2.8/diag = 0.17505, y ×1.2)
```

Impact is noticeably wider than the reference display face at the same
`font-size: 54px`, so the brand line runs longer. The placeholder tagline is
kept short so the line clears the music toggle at x=650 — the original's black
inline background covers whatever it overlaps, and so does this one. Re-tune
`ascent-override` / `descent-override` when the licensed face lands.

## 6 · Verified

- Design-space geometry probed live and matching the mirror exactly: brand
  `top:3`, icons `top:49`, music `left:650`, invert `left:741`, night-vision
  button `top:280`, scene height `629`, minimap `10px`, accent `#19e65a`.
- Canvas backing store is 1024 × 629 at every viewport (DPR hard-capped 1.0).
- Post chain is exactly six passes; ~464 triangles; one WebGL context.
- Captures in `/qa`: `hero-1024`, `hero-1440`, `hero-390`, `hero-intro-mid`,
  `hero-nightvision-1440`, `hero-invert-1440`.

---

# 7 · Rig swap — the Tripo energy machine

## 7.1 · Asset pipeline

**Landed at simplify ratio 0.08 → 149,812 tris, 2.37 MB on the wire.** The
source is 1,872,694 tris / 57.4 MB. A ratio sweep at error 0.01 gave
0.04 → 74,902 tris / 1.74 MB, 0.08 → 149,812 / 2.37 MB, 0.15 → 280,902 / 3.34 MB,
0.30 → 561,802 / 5.25 MB. Rendered side by side under both the hero's light rig
and neutral studio light, at full-body and 4× detail crops, **0.04 and 0.30 are
not visually distinguishable on this asset** — the normal map carries the detail
the simplifier removes. 0.08 was chosen over 0.04 purely for headroom: it lands
exactly on the 150k budget, and the tune mode invites close inspection where
0.04 might not hold up. If payload ever matters more than that, 0.04 is a free
0.6 MB.

**Textures cost more than triangles here.** The brief's budget covered wire size
but the real problem was VRAM: three 4096² maps is ~268 MB allocated. Resampled
to 2048² basecolor, 2048² normal, **1024² metallic-roughness** — an MR map is
low-frequency data and does not need parity with basecolor. Result: 3.0 MB →
0.91 MB on the wire, 268 MB → ~50 MB VRAM. WebP quality is per-slot: normal 92
(chroma loss there shows as facet banding in the tangent basis), basecolor 86,
MR 82.

**meshopt over Draco, and no import-map change was needed.** `MeshoptDecoder`
resolves through the existing `three/addons/` prefix, so the constraint against
new runtime dependencies is met without touching the import map.

**The pipeline is two processes, and that is not stylistic.** Importing
`@gltf-transform/functions` pulls in `ndarray-pixels`, which initialises libvips
such that *every subsequent `sharp` encode in that process* dies with
`colourspace: parameter space not set`. Bisected: `meshoptimizer`,
`@gltf-transform/core` and `@gltf-transform/extensions` are all clean; only
`functions` triggers it. This is why the brief's single `gltf-transform optimize`
command fails on this machine. `qa/step1-textures.mjs` (sharp, no `functions`)
and `qa/step2-geometry.mjs` (`functions`, no sharp) never share a process.
`prune()` also runs with `keepSolidTextures: true` because that check reads
texture pixels through the same poisoned path.

**Raw source is git-ignored** at `/source/`. Only `assets-final/hero-rig.glb`
ships.

## 7.2 · Scene

**`RIG_Y_STRETCH` is 1.0.** The old `model.scale.y *= 1.2` was tuned for the
procedural box mast and visibly distorts a real asset.

**`RIG_TARGET_DIAG` is 2.0, not 2.8.** The old rig was a tall vertical mast;
this model is 1.63× wider than it is tall, so at diagonal 2.8 it overflows the
28.5° frame. Screen constants are expressed as `fitted × K` where
`K = RIG_TARGET_DIAG / FIT_DIAG`, so the constant is a real knob — retune it and
the screens scale with the model instead of tearing off it.

**An environment map was added, and this exceeds "retune intensities".** The
rig's material samples at metalness 0.88 / roughness 0.07 — a near-mirror. A
metal that smooth reflects its surroundings and almost nothing else, so with no
environment it renders as a black silhouette *at any light intensity*; no amount
of retuning the spot/rim/fill fixes it. `hero.js` therefore builds one at runtime
with `PMREMGenerator` from a gradient shell plus a key card, using only §2
tokens, so every reflection is already in the palette. No new asset, no new
dependency. `ENV_INTENSITY` (5.0) is the knob; the four lights are untouched.

**Tone mapping is ACES filmic, and the accent lines opt out.** `toneMapped:
false` on the line materials keeps the §2 values literal — they are signal, not
lit surface. Screens already opted out. Bloom was retuned rather than disabled.

**Screens are seated by measurement, not by hand.** Each frame's front face was
fitted from the mesh's own vertex normals — the subset whose normal points
outward along that quadrant's XZ diagonal — which isolates the flat screen face
from the arm and bracket behind it. All four agree to three decimals: face
centre (±0.445, −0.087, ±0.453) at diagonal 2.8, face 0.708 × 0.572, canted 4.9°
nose-down, depth spread 0.069. Planes are inset to 0.640 × 0.500 and pushed
0.063 out along the face normal; the bezel relief stands ~0.048 proud of the
fitted plane, so anything less and the frame pokes through the video. Verified
numerically: zero mesh vertices in front of any screen rectangle, clearance
0.010–0.021.

**The GLB has no separable screen geometry.** One node, one mesh, one material,
zero draw groups — confirmed both in the source and on the loaded scene graph at
runtime. There are no bezel nodes to parent the video planes to. The measured fit
above is the substitute; true parenting needs the mesh split upstream
(Blender / Tripo re-export) or segmented at build time.

## 7.3 · Ceiling mount — an unresolved camera conflict

The rig now hangs: model bbox top is placed exactly at `CEILING_Y`, the
camera-right `visW * 68/1024` nudge and the `RIG_OFFSET` x-shift are gone, and
`rigBody` holds model + screens as one body so nothing can drift.

**The ceiling plane is a bounded disc, not an infinite plane, and that is a
compromise.** The idle camera sits at eye height 0.762 looking at the origin
through a 28.5° FOV, which leaves only ~1.5° of frame above eye level. That
forces a choice:

- `CEILING_Y > 0.762` (needed for the plane to be seen from below rather than
  backfaced) requires `CEILING_Y ≤ 0.254 × (3.471 − discRadius)`, which solves to
  `RIG_TARGET_DIAG ≤ 1.45` — a machine small enough to read as a speck in a
  mostly empty frame. Rendered; rejected.
- An infinite plane at any height the machine can also fit under is seen from
  *above* and floods the lower frame like a floor.

A bounded disc at the model's top avoids both failure modes and still reads as
the plate the machine is bolted to. **The real fix is raising the orbit target to
the machine's centre** (`controls.target.y` and `introToPos.y`), which was
explicitly out of scope — flagged for sign-off rather than done.

## 7.4 · Removals

Night vision (`nvPass`, `AfterimagePass`, the pre-warm block, `#nvBtn`), the
`hero:theme` / `uTheme` / `onBeforeCompile` theme mix, the whole overlay chrome
layer, `js/rig-bounds.js`, `buildPlaceholderRig()`, the CSS scanline veil, the
floor pentagram / neon ring / `ringCore` and their pulse, `BokehPass`, and the
mouse-parallax `pointermove` listener are all deleted, not disabled.
`GREEN_RAMP` stays — the screen grade is now its only caller, which is correct.

`BokehPass` specifically was the mush: `focus: 1.2` with the rig spanning ~0.9 in
depth put most of the mesh outside the focal plane, so it never resolved. Bloom
went 0.8/0.6/0.2 → 0.30/0.20/0.70; at threshold 0.2 nearly every lit surface
bloomed. `FILM_STRENGTH` is 0.10 with scanlines at 0 — at 2× crop it is almost
indistinguishable from off, and it is kept only because the scene is near-black
gradients where a whisper of grain prevents banding. Set it to 0 to drop it.

`#fixedLayer` was removed from the DOM rather than kept as an empty div;
`rescale()` null-guards it. Both the `zoom` and `transform` branches still scale
`#page` — verified.

**`chrome-in` now gates nothing visible.** The brief expected it to gate a scene
fade; it never did in this CSS — the scene is revealed by the preloader hiding.
`revealChrome()` is kept as the documented `hero:ready` hook, but it is inert.

**Screen 404s removed.** `HERO_ASSETS.finalScreens` (false) makes the loader skip
the `assets-final/*.mp4` probe instead of 404ing four times per load.

**The intro now reads world-space.** `outwardNormal()` and the dolly's start pose
use `getWorldPosition` / `getWorldQuaternion` because the screens live two groups
deep instead of directly in the scene. Same rule, same resulting pose — without
this the dolly would aim at a local coordinate and start in the wrong place.

## 7.5 · Screens are cut from the mesh, not laid over it

The PlaneGeometry overlays are gone, along with every hardcoded screen
transform. A flat plane can never line up with these display faces: they are
tilted, non-axis-aligned quads, so any plane fitted to them sits slightly
crooked and spills past the bezel no matter how well the transform is measured.

The GLB offers no way to do this the easy way. Re-confirmed on the loaded scene
graph: one mesh, `tripo_node_148553b5-...`, 149,812 tris, **zero draw groups**,
one material — so there is no screen sub-mesh whose material could be swapped.
Its `TEXCOORD_0` spans u 0..1 and v 0..1 over the *entire* model (a single
atlas), so the mesh's own UVs cannot carry a video either.

What it does have is the display faces themselves, as real triangles. So the
screens are now built from those triangles' actual vertex positions:

- per XZ-diagonal quadrant, keep triangles whose centroid is beyond
  FACE_MIN_RADIUS, whose geometric normal points outward along the diagonal
  (dot >= 0.88), and whose depth along it falls within FACE_SLAB of the modal
  plane. Measured: all four faces peak at ~0.70 mesh-local with the bulk inside
  +-0.03 — one flat plane, no recessed bezel.
- reject in-plane outliers by percentile (FACE_TRIM) before measuring anything.
  This matters more than it looks: a few stray coplanar triangles off to one
  side would stretch the (u,v) extent the UVs normalise against, shifting and
  shrinking the video across the whole panel.
- UVs are a planar projection onto the face's own basis, **cover-fit** rather
  than stretched — the face is ~1.24:1 and the footage is 16:9, so filling by
  stretching would smear the code text sideways.
- the result is added as a child of the GLB mesh, so the two share a transform
  exactly and cannot drift.

Because the geometry *is* the face, spill is not something that had to be tuned
out — there is no longer a separate quad to misalign. Verified by flat-shading
the extracted geometry against the model: the panel is a clean rectangle that
stops at the bezel.

Note `FACE_NORMAL_MIN` was briefly 0.95 and that was too strict — it rejected
triangles near the top of the panel where the surface curves slightly, chewing
a sawtooth into the top edge. 0.88 plus the percentile trim is the right split
of labour: the normal test finds the face, the trim removes the strays.

## 7.6 · Resolution — the real cause of the blur

`HERO_DPR` was hard-capped at 1.0, but raising it to `devicePixelRatio` alone
would not have fixed anything. `#scene3d` is 1024 CSS px wide inside a `#page`
that chrome.js scales by `viewportWidth / 1024`, so `container.clientWidth`
always reports 1024 while the canvas is *displayed* ~1.4x larger than that on a
1440 viewport. The backing store has to cover design scale **and** device ratio:

```
heroPixelRatio() = min(devicePixelRatio * window.__SCALE, 2)
```

Measured at a 1440 viewport: pixel ratio 1.40625, backing store 1440x884,
canvas CSS width 1440 — exactly 1:1, where before it was a 1024-wide buffer
stretched over 1440 pixels. A plain `resize` listener was added alongside the
ResizeObserver because `rescale()` changes `__SCALE` without changing
`clientWidth`, so the observer never fires on a pure scale change.

Also on sharpness: the stock clips were the 640x360 SD cuts, which visibly
pixelate on a face that is ~800 device px wide — swapped for 1280x720. Model
textures and video textures both get `anisotropy = getMaxAnisotropy()`.

Bloom landed at strength 0.45 / radius 0.18 / threshold 0.72. Threshold 0.85
was tried and is too far: the machine went black, because the old look was
leaning on bloom at threshold 0.2 to fake surface brightness. The right lever
for that is `ENV_INTENSITY`, which went 5 -> 15 — that brightens the metal's
actual reflections, which is crisp, instead of adding glow, which is not.

## 7.7 · The orbit moved up, and the refresh glitch

**The orbit target now sits at the machine's centre, not the world origin.**
This was the open item flagged in 7.3 and it is the only thing that makes a
ceiling mount readable with this camera. `ORBIT_Y` is derived at load — it is
`rigBody.position.y`, which by construction *is* the model's bbox centre — and
the camera is placed `ORBIT_RISE` (-0.10) below it, so the shot looks slightly
upward and the ceiling is seen from underneath.

The orbit itself is unchanged, which was the constraint: radius 3.473 (was
3.471), the same manual spin at the same rate, the same `[1.35, 1.65]` polar
clamp — the resulting polar is 1.60, comfortably inside it. Only the centre of
the orbit moved. `ORBIT_XZ` is the original XZ scaled to hold the radius while
the Y offset changed.

The ceiling plane went from a bounded 2.3 disc to a 6.0 one, because with the
camera below it there is no longer any risk of it reading as a floor. Its shader
gained a spill pool and a rim halo at the disc's edge: the join is sold by light
falling on the ceiling *from* the fixture, far more than by the slab itself.

**The refresh glitch was the render loop starting before the camera was posed.**
`animate()` began drawing immediately at module evaluation, while the camera was
still at its construction position and the rig was still loading. So a refresh
showed a wrong-angle view of a half-loaded machine, which then *snapped* to the
dolly's start pose when the promise resolved. Three fixes, all in that order:

- a `sceneReady` gate — nothing renders until the rig is loaded, the dolly is
  armed and the pose is set. The canvas is transparent over a black page until
  then, so only the preloader shows.
- `renderer.compile(scene, camera)` immediately before arming, while nothing is
  on screen. Without it the first frame of the dolly pays for every PBR and
  video shader compile and visibly hitches exactly as the motion starts.
- the canvas fades in over 0.4s on `hero:ready` via `body.chrome-in`, instead of
  popping. This also finally gives `chrome-in` something to do — 7.4 noted it
  had been left gating nothing.

Verified frame by frame: at 500ms only the preloader is on screen, at 1100ms the
canvas is fading in with the dolly already at its start, and 1900-5200ms is one
continuous pull-back with no jump.

## 7.8 · Scale, atmosphere, and the ceiling as a dome

Matched against a reference render supplied by the client. Three changes.

**`RIG_TARGET_DIAG` 2.0 -> 3.6.** The reference has the machine filling the
frame; at 2.0 it sat in the middle of a lot of empty black. This is safe to
change now precisely because 7.5 made the screens geometry cut from the mesh
and 7.7 derives `ORBIT_Y` from the loaded model — the screens, the ceiling
alignment and the orbit centre all follow the constant instead of having to be
retuned behind it. Checked at three orbit azimuths: nothing clips.

**Fog needed something to land on.** `scene.fog` only tints geometry, never
empty space, so `FogExp2` alone on a black background does nothing to the frame
— it would haze the rig and leave the emptiness behind it flat. So there are
two pieces: `FogExp2` at 0.115 for depth separation across the machine (the far
arms sink back instead of reading as one flat cutout), plus a backdrop shell —
a 22-unit inside-out sphere carrying a vertical gradient broken up by fbm noise,
with a soft core glow so the machine sits *in* the haze rather than in front of
a wall of it. The backdrop is a `ShaderMaterial`, which ignores `scene.fog` by
default: it *is* the haze and must not be fogged on top of itself.

The screen material takes `fog: false`. The screens are emissive panels, and
hazing them eats exactly the contrast that makes the on-screen text readable —
which 7.6 had just spent the effort to win.

**The ceiling is a spherical cap now, not a flat disc.** Seen from underneath a
flat plane collapses to a hard straight edge ruled across the frame. A shallow
dome curves away at the sides and reads as something the room actually has.
`CEILING_ARC` (0.42 rad) sets how far it wraps; the cap's pole sits exactly at
`CEILING_Y`, which is where the model's bbox top is pinned, so the shaft still
meets it flush and the 7.7 assertion still holds. The shader gained fbm
mottling on top of the pool and rim halo, so the surface reads as material
rather than as a gradient.

## 7.9 · Vertical drag was clamped almost shut

`minPolarAngle` / `maxPolarAngle` were `[1.35, 1.65]` — a 17 degree band — while
the camera rests at 1.60. That left roughly 0.05 rad of downward travel and
0.25 up, which is why the drag felt locked on the vertical axis while the
horizontal one felt fine.

The upper bound is dictated by the ceiling, not by taste. The orbit target sits
at y -0.098 with a radius of 3.473, so camera height is
`-0.098 + 3.473 * cos(polar)`:

| polar | camera y | vs the dome pole at 0.62 |
|---|---|---|
| 1.30 | 0.831 | above the ceiling — the read collapses |
| 1.38 | 0.561 | legal, but only 0.06 clear; the dome flattens to an edge-on band |
| 1.42 | 0.424 | 0.20 clear — the dome still reads as a dome |
| 2.15 | -1.999 | looking up from underneath |

So the top end stays tight at **1.42** and the range opens *downward* instead,
where nothing is in the way: **[1.42, 2.15]**, 42 degrees against the old 17,
and the direction that was dead (0.05 rad) is now the roomy one (0.55).
`rotateSpeed` 0.4 -> 0.55, since the wider band wants more travel per pixel.

The ceiling itself is untouched, which was the constraint — the clamp was moved
to fit it, not the other way round. Verified by driving real drags through the
browser: 1.60 -> 1.38 dragging one way, 1.60 -> 2.15 the other, and all three
positions rendered to confirm the dome holds at both limits.

## 7.10 · Neutral scene, green only in the material

Matched to a client reference: a Blender-viewport render of the raw GLB on a
plain grey backdrop. The complaint was that the build read as a colour filter
over the viewport rather than as a lit object, and it was correct — green was
being applied in **thirteen** places, only one of which was the model:

lights (ambient / key / rim / fill), `scene.fog`, the backdrop shell, the PMREM
env shell, the ceiling dome, the light shaft, the screen grade, the emissive
injection, and the grade pass's split-tone. With a green key on a green
material every highlight came back saturated green, which is exactly why the
glass never read as glass — a specular highlight has to return the colour of
the *light*, not of the surface.

So: everything that lights the model or sits behind it is now neutral, and the
only hue left in the frame comes from the GLB's own basecolor.

| | before | after |
|---|---|---|
| ambient | `0x0d3330` 0.05 | `0x2a2e33` 0.42 |
| key spot | `0xdaffe9` | `0xfff6ec` (white, a hair warm) |
| rim | `0x35e8c4` 1.70 | `0xdfe9ff` 1.25 |
| fill | `0x1aff5e` 0.10 | `0xffffff` 0.32 |
| fog | `0x04160c` @ 0.085 | `0x0e1013` @ 0.055 |
| backdrop | `0x03100a` → `0x2fbf63` | `0x0a0b0c` → `0x1a1c1e` |
| ceiling pool | `ACCENT` | `0xd8e2ea` |
| light shaft | `KEY_TINT` @ 0.020 | white @ 0.007 |
| grade split-tone | teal/mint @ 0.42 | near-neutral @ 0.14 |
| bloom | 0.45 / 0.18 / 0.72 | 0.20 / 0.14 / 0.90 |
| exposure | 0.78 | 0.95 |

**The emissive injection was deleted outright.** It pushed the basecolor through
the accent and added a forced green glow on top of the GLB's own PBR — the
"green multiply" that flattened the material. The maps now speak for themselves.

**The env shell is deliberately much brighter than the visible backdrop**
(`0x24282c` → `0xc2ccd4`, against a backdrop of `0x0a0b0c` → `0x1a1c1e`). It is
never drawn; it only feeds PMREM. A near-mirror reflects the environment and
almost nothing else, so an env matched to the dim background leaves the metal
with nothing to return and it goes black — which is exactly what happened on the
first neutral pass. A studio softbox is far brighter than the wall behind the
subject; same principle. `ENV_INTENSITY` 2.5 -> 3.4 against the new shell.

**Screens sit back now.** `SCREEN_GAIN` 0.26 plus the ramp drive pulled from
1.15 to 0.62. The drive was the real culprit: at 1.15 mid luminance landed at
the *top* of the tier ramp, so every clip resolved to the same flat bright
green and the panels led the frame. At 0.62 they land in the dark tiers and
read as filament detail on near-black panels.

**Exposure went UP, not down**, 0.78 -> 0.95. Counter-intuitive against a brief
asking for deeper shadows, but the green lights had been delivering far more
energy than the neutral ones do; at 0.78 the neutral pass was nearly black.
Depth comes from the grade's contrast curve and vignette instead, and
`GRADE_PIVOT` moved 0.28 -> 0.16 because the higher pivot was crushing the grey
backdrop gradient to black — the background has to be visible as a gradient.

No geometry, position, camera or scroll behaviour was touched.

## 7.11 · The light rig came off, and the material was the real culprit

The brief: strip the lighting off the GLB, get its original colours back, then
light it with one white light so it reads the way the asset was designed —
and fix the screens, which were too dark to see the video on.

**The "weird lighting" on the spine was not lighting.** Measured off the GLB's
own metallic-roughness texture, over all 1024²:

| channel | mean | median | p10 | p90 |
|---|---|---|---|---|
| roughness (G) | 0.068 | **0.020** | 0.004 | 0.247 |
| metalness (B) | 0.876 | **0.961** | 0.573 | 0.984 |

That is one near-perfect mirror stretched over every part of the machine —
panels, cables, hub alike. It is a Tripo bake, and the MR map is degenerate.
A metal surface has **no diffuse response at all**, so at metalness 0.96 the
model cannot show its basecolor under any light: it returns the environment,
picking up the green only as a tint at grazing incidence. Hence the blown, wet,
hotspot-down-the-spine read, and hence why the previous pass had to push
`ENV_INTENSITY` to 3.4 — the env was the only thing the surface could see.

So the map is kept, for its variation, and remapped in `onBeforeCompile`:
`metalnessFactor *= 0.15` and `roughnessFactor = mix(0.42, 0.90, roughnessFactor)`.
Same texture, same detail, but the surface is now diffuse-dominant and the
basecolor — which is what the model's colours actually are — is what the lights
land on and come back from. Nothing else about the PBR is touched: no emissive,
no tint, no accent multiply.

**Every light is now pure white and the rig is a plain three-point studio.**
The old rig was performing a look at the model rather than lighting it: a
26-intensity spot jammed against the mount with decay 2, plus a rim and a fill
each on its own tint.

| | before | after |
|---|---|---|
| ambient | `0x2a2e33` 0.42 | `0xffffff` 1.4 |
| practical (spot) | `0xfff6ec` 26, angle 0.62, penumbra 0.82, decay 2 | `0xffffff` 9, angle 0.80, penumbra 0.95, decay 1.5 |
| key | — (the spot was the key) | `0xffffff` 3.6, front-left 3/4 |
| fill | `0xffffff` 0.32 | `0xffffff` 1.2 |
| back/rim | `0xdfe9ff` 1.25 | `0xffffff` 1.5 |
| env intensity | 3.4 | 1.6 |
| exposure | 0.95 | 1.0 |

The ceiling spot is kept only because it is what motivates the pool drawn on the
dome and the shaft under it — softened to a room light spilling down the machine
instead of a hotspot burning a hole in the top of it.

**Intensities went UP across the board**, which looks wrong next to a brief
about removing lighting, but the basecolor is dark: mean sRGB (0.19, 0.31, 0.09),
value 0.31 at saturation 0.74. A diffuse surface that dark needs real light to
show its colour, where a mirror needed almost none. Swept `key` 2.6 → 4.2 against
green-channel clipping measured over the rendered frame; 3.6 / env 1.6 / exposure
1.0 sits at 0.88% of lit pixels clipping, against 0.58% at the dimmest setting
tried and 1.1% at the brightest — the knee, and the point past which the baked
highlights in the basecolor start blowing out.

**Screens: `SCREEN_GAIN` 0.26 → 0.70 and the ramp drive 0.62 → 1.0.** The drive
is what actually hid the footage. It scales luminance before the §2 tier lookup,
so at 0.62 a mid-grey pixel resolved at ramp position 0.31 — `#0a3d1f`,
near-black — and every clip collapsed into the ramp's two darkest tiers with its
content. At 1.0 mid-grey sits at `#148f43`→`#19e65a` and the video reads. Gain
stops at 0.70 rather than higher because it multiplies in *linear* space on
panels that opt out of tone mapping: 0.85 clipped a bright clip's sky flat and
put the panels back in front of the machine. `HERO_ASSETS.screenGrade = 0` still
drops the green grade for raw footage colour.

`window.__composer` was added to the `?tune=1` exports, so a QA capture can force
a frame without the rAF loop. No geometry, position, camera or scroll behaviour
was touched.

## 7.12 · The ceiling was a saucer, and vertical orbit is off

### What the ceiling actually is

Asked before changing anything. The scene holds exactly four drawn things:
the backdrop shell (`renderOrder -2`), **one** ceiling cap (`-1`), the light
shaft (`3`), and the GLB (149,812 tris) with the four screen meshes parented
into it.

**It is not double geometry.** The GLB does bring its own disc — that is the
machine's *canopy*, its mounting plate, world radius `CANOPY_R` 1.651, fused
into the single-node mesh and not separable without cutting the model. The
ceiling is a separate spherical cap of radius 70. They are seated flush (rim
gap -2e-6, measured at load) but cannot z-fight: the ceiling has
`depthWrite: false` and `renderOrder -1`, so it paints before the canopy exists
in the depth buffer and the canopy draws cleanly over it. Nothing to delete.

### The bright rim was not a specular — the shader was drawing it

There is no specular term on this surface and never was: it is a hand-shaded
`ShaderMaterial` with no roughness, no env and no reflection. The highlight was
the `halo` term, a deliberate bright ring at exactly `uCanopyR` — i.e. traced
along the canopy's rim.

Isolated by gating each term behind a uniform and sampling the rendered centre
column with the model and backdrop hidden (luminance, 8px steps):

| | profile through the edge |
|---|---|
| all terms | `9, 8, 11, 22, **29**, 26, 11, 5, 4, 3 …` |
| halo off | `9, 8, 8, 7, 7, 7, 6, 5 …` |

A jump from 11 to 29 and back to 0 inside 40px. That step *is* the "hard edge" —
the surface did not really stop there, it flared and then had nothing left to
show. `halo` is deleted outright.

### Making it read as infinite

Two changes, because the fade alone was never going to be enough:

- **`uBase` is now multiplied by `slab` rather than added as a floor.** Tone and
  coverage now reach zero at the same radius. Before, the colour held a constant
  grey while only alpha faded, which leaves a flat plateau that ends.
- **`CEILING_ARC` 0.145 → 0.30**, moving the geometric rim from r 10.1 to r 20.7
  (y -2.5), far outside the frame. Insurance only — the shader has faded the
  surface to nothing by r ~8 — and it costs no triangles, since `SphereGeometry`
  segment counts are independent of the arc.

`pool` widened to `uCanopyR * 0.35 … 2.6` and `slab` to `0.9 … 5.0`, so the
surface is darkest at the frame edges and lifted only around the mount. The pool
is the one thing that reads.

Verified by sampling columns at x 0.02 / 0.25 / 0.50 / 0.75 / 0.98 with the model
hidden: **the largest step between adjacent 8px samples is 1 level**, against 18
at the old halo. Peak 12 at the pool, 3–7 at the frame edges. There is no
boundary to find. The scene is rotationally symmetric about Y and the polar angle
is now fixed, so this holds at every point in the 360° orbit by construction.

One consequence worth naming: with the ceiling taken down to a whisper, the
widest bright thing at the top of frame is the GLB's own canopy. The disc
silhouette up there is the machine's mounting plate, not the room.

### Vertical orbit disabled

`controls.minPolarAngle === controls.maxPolarAngle === ORBIT_POLAR`, so
OrbitControls clamps phi back on every update and a vertical drag is a no-op.

`ORBIT_POLAR` is derived — `atan2(hypot(ORBIT_XZ), ORBIT_RISE)` = 1.5996 — not
typed in, so retuning the orbit constants moves the lock with them. It is also
exactly the angle the intro dolly lands on, so the clamp does nothing on
hand-off and the camera cannot snap when controls take over (measured delta from
the lock at hand-off: 0).

Horizontal drag, the idle auto-spin and the intro dolly are untouched — all
three rotate about Y, which does not change phi. Touch is unchanged too:
`touchAction: 'pan-y'` still gives vertical swipes to the page and horizontal
drags to the rig.

Verified by dispatching real pointer drags at the canvas and settling the
damping:

| drag | phi | theta |
|---|---|---|
| start | 1.5996 | 2.4781 |
| 260px down | 1.5996 | 2.4781 |
| 260px up | 1.5996 | 2.4781 |
| 300px across | 1.5996 | 0.8838 |

Vertical moves nothing. Horizontal moves theta by -1.594 rad with phi delta
exactly 0.

## 7.13 · Vertical motion, actually gone this time

§7.12 locked the polar angle and I verified it by dispatching drags and calling
`controls.update()` by hand. That verification was **not good enough**: the
Browser pane here does not composite, so `requestAnimationFrame` is paused and
`animate()` never runs. I tested the clamp in isolation, not the running app,
and I reported it as if I had tested the app.

Re-tested properly, driving `animate()`'s idle branch off a `setInterval` so the
loop really turns. The polar clamp does hold — a 360px vertical drag moves
`camera.position.y` by exactly 0. But the scene still had vertical motion in it,
in the one place §7.12 never looked: **the intro dolly**. Measured, it started
0.103 below the resting height and lifted its aim 0.111 over the four seconds,
on every load.

Two changes:

**The dolly is flattened onto the locked orbit height.** `introFromLook.y` and
`introFromPos.y` are pinned to their `introTo*` counterparts, so the lerp has
nothing to interpolate vertically and the intro spin turns about Y, which cannot
change height either. Everything else about the intro is untouched: same
push-out along s3's normal, same 4000ms, same easing, same spin blend. Two lines,
and deleting them restores the vertical component.

**A hard height lock re-seats the camera after every idle frame.**
`lockCameraHeight()` re-derives the spherical offset from the target and forces
`phi` back to `ORBIT_POLAR` and `radius` to `ORBIT_RADIUS`. The min/max polar
clamp lives inside OrbitControls and only governs what OrbitControls itself does
to the camera; this governs the camera. It skips the write when the camera is
already seated, so the common case costs one `setFromVector3` and two compares.

Verified with the loop running:

| | result |
|---|---|
| intro vertical travel | **0** (start height == resting height) |
| `camera.position.y` across 15 samples of a 600px vertical drag | **-0.217145 → -0.217145**, min == max |
| `camera.position.y` after shoving the camera +1.5 by hand | **-0.217145**, re-seated |

`camera.position.y` is now constant for the entire lifetime of the page, from the
first rendered frame onward.

## 7.14 · The "broken card" was the clip, not the card

Reported as the video sitting in the wrong position on one panel: a bright green
bar across the top of the code screen. Checked the geometry first, because that
is what the last four sections had been touching.

**The geometry is fine, and all four faces are equivalent.** Extracted face,
per quadrant, before the percentile trim:

| face | modal plane | tris in slab | height |
|---|---|---|---|
| 0 | 0.7065 | 1385 | 0.983 (trimmed to 0.624) |
| 1 | 0.6967 | 5675 | 0.632 |
| 2 | 0.7004 | 1219 | 0.625 |
| 3 | 0.6957 | 1297 | 0.627 |

All four trim to ~0.78 x 0.63, all four take the same cover-fit, and rendering
the suspect face with a UV-ramp material showed the mesh covering the panel
corner to corner with v running 0 at the bottom to 1 at the top. Nothing about
that card is different.

**It is the footage.** Decoding the clip and measuring mean row luminance:

| depth into frame | 0% | 2% | 4% | 6% | 8% | 12% | 18% | body |
|---|---|---|---|---|---|---|---|---|
| clip 2278095 (screen 3) | **157** | 139 | 118 | 96 | 71 | 47 | 32 | 23-29 |

A bright gradient baked across the top of every frame — sampled at t=1.7s,
51.4s and 53.9s it is identical to the digit, so it is the clip's content and
not a decode artefact or one bad frame. The §2 grade maps 157/255 straight into
the ramp's bright tiers, which is why it rendered as a lit bar. The other three
clips are flat across their top — row 0 against body: 111/95, 96/71, 40/37.

**Fix: `SCREEN_TOP_CROP` 0.14.** The window sampled out of every clip drops its
top 14%. Both axes are scaled by the same factor, so the cover-fit still holds
and nothing stretches — the crop just frames tighter. Applied to all four rather
than to the one index, so the set stays consistent and there is no per-asset
special case in the extractor; on the nature clips it is an unnoticeable
reframe. Set it to 0 when real screen finals land in `assets-final/`.

Verified on the rendered frame: the top 6% of the panel now measures mean
luminance **13.3** against **14.6** across its middle — the top is no longer the
brightest thing on the card. Before, that band was.

Worth knowing for later: the extractor's outlier trim leaves a few triangles on
the side pillars and the base in every face — visible as stray patches in the
UV-ramp render. They are within the same depth slab and get valid UVs, so they
show small pieces of video off the panel. Measured, the effect on the UV extent
is the same across all four faces (width inflation 5-16%, height 11-15%), so it
is not what caused this report and tightening it would risk clipping real face
edges on the other three. Left alone deliberately.

## 7.15 · Framing the mount out of shot

Asked to hide everything above a line drawn across the top of the frame — the
canopy and the ceiling — by pushing the scene up until they are out of view.

**Pushing up alone cannot do it.** The canopy is a disc of world radius 1.651
seen from 3.47 away, subtending ~50 degrees against a 44 degree frame. Lowering
the orbit centre (target and camera together, so the view direction is
unchanged) lifts everything in frame, but the numbers run out:

| drop | canopy far rim, % down from top | machine bottom, % down |
|---|---|---|
| 0 | 24.4 | 89.8 |
| 0.15 | 18.7 | 81.2 |
| 0.35 | 11.0 | 69.8 |
| 0.55 | 3.5 | 58.3 |
| 0.65 | -0.3 | 52.6 |

The rim only clears the top edge at a drop of ~0.65, and by then the machine
ends at 53% of the frame with the whole lower half empty. Rendered, it looks
like the shot slid off the top of the screen.

**The lens does the rest.** Narrowing FOV crops the top — taking the canopy with
it — while magnifying about the frame centre, which pulls the machine's tail
back down and widens it to fill the frame. Drop and lens have to move together:

| FOV | drop | rim % | bottom % | left / right % |
|---|---|---|---|---|
| 28.5 | 0 | 24.4 | 89.8 | 7.6 / 92.2 |
| 24 | 0.10 | 14.8 | 90.6 | 4.4 / 93.3 |
| 22 | 0.14 | 9.5 | 91.5 | 2.4 / 97.4 |
| **20** | **0.18** | **3.2** | **92.3** | **0 / 99.9** |
| 19 | 0.21 | -1.0 | 92.0 | 0 / 99.9 |
| 18 | 0.24 | -5.8 | 91.7 | 0 / 99.9 |

**Shipped: `CAMERA_FOV` 20, `FRAME_DROP` 0.18.** The lid edge that cut across
the frame goes from 24.4% down to 3.2% down, the machine's bottom improves from
89.8% to 92.3%, and the shot fills the frame edge to edge. Verified identical at
all eight 45-degree steps of the orbit, which follows from the canopy being a
disc and the scene being symmetric about Y.

**It is a reduction, not a removal, and that is deliberate.** Taking the rim to
exactly 0 needs FOV 19, and at 19 the outer screens are cut hard at the frame
sides and the machine's head goes with them. A dark sliver along the top edge,
mostly behind the spine, reads as nothing; losing half a screen does not.

Two consequences worth naming: the machine's head now bleeds off the top edge —
unavoidable, since the canopy sits directly above it, so hiding one crops the
other — and the shot is tighter overall, so the screens sit closer to the frame
sides.

`FRAME_DROP` does not disturb the height lock from §7.13: `ORBIT_POLAR` and
`ORBIT_RADIUS` are built from `ORBIT_XZ` and `ORBIT_RISE`, which are offsets
relative to the orbit centre, so moving that centre moves the whole rig without
changing the angle or the distance. Confirmed on the shipped build — orbit
centre -0.2971 against a machine centre of -0.1171, polar still pinned at
1.5996.

`#scene3d` is a fixed 1024x629 box that chrome.js only scales, so the aspect is
1.628 on every device and this framing is identical everywhere — a vertical FOV
change is safe here in a way it would not be in a fluid layout.

## 7.16 · FOV refitted to a supplied reference frame

§7.15 narrowed the lens to 20 to push the mount out of shot. A reference frame
supplied afterwards is a wider composition, and the FOV is now fitted to it.

**Only the horizontal fit is meaningful, and that is a property of the layout.**
`#scene3d` is a fixed 1024x629 box that chrome.js only scales, so on a 2000px
viewport the canvas is 2000x1228 CSS px. A browser window shorter than that
crops the bottom, and if the page is scrolled the crop is not even from the top
— so every vertical measurement taken off a screenshot carries an unknown
offset. Width carries none: the canvas always fills the viewport horizontally,
so x fractions are exact.

That was not academic. Fitting on all three of (width, canopy rim, machine
bottom) against the reference produced no consistent solution — the best
candidates were off by 40% on the rim and 10% on the bottom in opposite
directions, which is the signature of a bad assumption, not a bad fit. Dropping
the two cropped measurements resolved it immediately.

| FOV | machine width, fraction of frame |
|---|---|
| 20 | 0.999 |
| 28.5 | 0.804 |
| 32 | 0.727 |
| 33 | 0.725 |
| **34** | **0.705** |
| 35 | 0.680 |

Reference: machine spanning 14.5% to 85.0% of frame width, i.e. 0.705. At
**`CAMERA_FOV` 34** it spans 14.8% to 85.3%. Measured across all eight
45-degree steps of the orbit the width holds at 0.699-0.706. 34 is the fit, not
a round number.

`FRAME_DROP` stays at 0.18 — the request was about the lens.

**The mount is back in shot, and that is not reconcilable.** §7.15 hid the
canopy and ceiling; this restores them. The mount sits directly above the
machine, so any frame wide enough to show the machine with margin on both sides
also shows the mount — and the supplied reference itself shows it. The two
requests cannot both be satisfied; the reference is the newer instruction and
wins.

Nothing else moved. The height lock is intact on the shipped build: orbit
centre -0.2971 against a machine centre of -0.1171, polar pinned at 1.5996.

**Method note, for the next time a measurement is taken off the canvas:** sample
the pixels BEFORE `toDataURL` and before any `await`. `preserveDrawingBuffer` is
false, so the drawing buffer is cleared at the next yield and a `drawImage` after
an awaited upload reads pure black. A whole sweep was silently zeroed this way
before it was caught.

## 7.17 · The mount is cut out of the scene, not framed out of it

§7.16 refitted the lens to a supplied reference and noted the consequence: at
FOV 34 the canopy and ceiling are back in frame, and no camera setting removes
them without throwing away the composition. Confirmed by measurement before
trying anything else — at FOV 34 the canopy's far rim needs a drop of ~0.88 to
clear the top edge, which puts the machine's bottom at 40% of the frame.

So the mount is removed from the scene.

**Three things go, and only one of them is difficult.** The ceiling dome and the
light shaft are their own meshes and simply stop being drawn. The canopy is
fused into the single 149,812-triangle mesh, so it comes off with a clipping
plane on that material (`renderer.localClippingEnabled`, per-material — a global
plane would also slice the backdrop shell, which is 22 units out and would lose
most of its visible height).

**Where to cut was measured.** Max horizontal radius per world-Y band over the
model's vertices:

| y | max r | | y | max r |
|---|---|---|---|---|
| 0.60 | 0.11 | | 0.52 | 0.896 |
| 0.58 | 1.168 | | 0.50 | 0.787 |
| 0.56 | 1.167 | | **0.48** | **0.184** |
| 0.54 | 0.994 | | 0.46 | 0.196 |

The plate is everything above y 0.49 — 0.11 of height, flaring to r 1.17.
Below it the model is a bare shaft of r ~0.19. So the cut is taken 0.11 below
the model's top: nothing of the plate survives and it passes through the
narrowest part of the machine. The constant is `MOUNT_PLATE_DEPTH`, applied to
`domeYatRadius(rXZ)` — the same expression the seating uses for the model's top
— rather than the literal 0.49, so it follows a rescale or a re-seat.

**The cut is not hidden and does not need to be.** Lifting the rig until it
cleared the frame was tried: 0.36 of lift does hide it, and costs the
composition, taking the machine's bottom from 74.5% to 57.3% of the frame. Left
where it is, the cut lands on the shaft's collar at 11% down the frame and is
seen from 14 degrees below, so the opening is foreshortened almost to nothing
and it reads as the machine running up out of shot. No cap geometry, no lift.

Verified on the shipped build at all eight 45-degree steps of the orbit: top of
the machine at 11.0-11.5%, bottom at 73.3-74.6%, width 0.593-0.603 — the
reference framing from §7.16 is untouched. Clip plane resolves to y 0.4905
against the 0.49 that was measured by hand.

`HIDE_MOUNT` is a single flag and both meshes keep their code, because this
composition has now been reversed twice; setting it to false restores the room.
The width metric drops from 0.705 to ~0.60 with the mount gone — the canopy was
the widest thing in frame, so that number is no longer comparable to §7.16's.

## 7.18 · §7.17 reverted — the mount is back

`js/hero.js` restored to its state at c6638f2, byte for byte. `HIDE_MOUNT`, the
`MOUNT_PLATE_DEPTH` constant, `renderer.localClippingEnabled` and the clipping
plane on the model material are all gone; the ceiling dome and the light shaft
draw again.

§7.17 is kept above rather than deleted, because the measurement in it is the
useful part and is independent of whether the cut ships: the canopy plate is
everything above y 0.49, 0.11 of height flaring to r 1.17, over a shaft of
r ~0.19 — so the plate can be removed with a single clipping plane 0.11 below
the model's top, and the resulting cut sits at 11% down the frame. If the mount
ever needs to come off again, that is the recipe and it does not need
re-deriving.

Verified on the reverted build: clipping disabled, zero clipping planes on the
model material, ceiling and shaft visible, FOV 34, orbit centre -0.2971, polar
still pinned at 1.5996, machine width 0.699-0.705 against the reference's 0.705
and bottom at 73.3-74.6%. Everything from §7.11 to §7.16 is untouched — the
white studio lighting, the material remap, the screen gain of 0.70, the top crop
of 0.14, the height lock and the FOV fit all still stand.

# 8 · Sections 2 and 3, added and removed

A holographic-tree section and a neon-screen-display section were built on top
of the hero and then removed at request. `js/tree.js`, `js/neon.js`,
`assets-final/holographic-tree.glb` and `assets-final/neon-screens.glb` are
deleted, along with both raw sources; `index.html`, `css/hero.css` and
`js/chrome.js` are back to serving the hero alone, with `PAGE_H` returned to
624 so the body is once again exactly the hero's height — which puts the hero's
`SCROLL_SPIN` back to being dormant, as it was before §8 existed.

Two things from that work are kept deliberately, because neither is
section-specific:

- **`package.json`.** The asset pipeline had no manifest at all — the deps had
  been installed ad hoc and were gone by the time they were needed again. They
  are now pinned, with `node_modules/` and `package-lock.json` git-ignored.
  Nothing in it ships; it is what `qa/step1-textures.mjs` and
  `qa/step2-geometry.mjs` need in order to rebuild `hero-rig.glb`.
- **The measured settings.** Both models ran through that pipeline unchanged at
  the rig's own numbers — textures 4096² → 2048/2048/1024, geometry ratio 0.08
  at error 0.01 — and both landed where the rig did: 55.3 MB → 1.83 MB and
  52.6 MB → 1.97 MB, each keeping 8.0% of its triangles. Three Tripo exports of
  ~1.9M triangles have now taken those settings without retuning, which is worth
  knowing before anyone reaches for the knobs on a fourth.

# 9 · Lighting matched to the default model viewer

Given a reference frame of the rig as a default model viewer renders it, and
asked to use that lighting.

**The difference was the shape of the environment, not its brightness.** §7.11
replaced a green light rig with a white one and built the environment by hand:
a sphere carrying a three-stop vertical gradient, plus a bright card at the
mount. That is the wrong kind of thing for a near-mirror to reflect. A gradient
has no features, so a polished surface returns a smooth wash and reads as tinted
plastic. `RoomEnvironment` — the neutral studio that model-viewer, gltf-viewer
and three's own examples use — is a little room with actual light panels in it,
so the same surface returns *edges*, and edges are what make it read as glass.
The asset has looked like glass in every viewer except this one for exactly that
reason. It is a three addon, generated at runtime: no asset, no fetch, PMREM
disposed immediately.

**The spot is deleted.** It was a 26-then-9 intensity cone at the mount, there
to be the machine's key and to motivate the pool drawn on the ceiling. With the
environment lighting the model properly it had no work left except to put a
hotspot on the canopy — which is the artefact this whole thread opened with. The
ceiling's pool and the light shaft are drawn in their own shaders and never
depended on it.

**Ambient went 1.4 → 2.4, and that is what actually fixed the canopy.** A disc
that wide facing DOWN takes almost nothing from a key above it and nothing from
a rim behind it. In the reference its underside is a lit olive-green; ambient
and the environment are the only things that can put light there.

| | before | after |
|---|---|---|
| environment | hand-built gradient shell + key card | `RoomEnvironment` |
| env intensity | 1.6 | 5.0 |
| ambient | 1.4 | 2.4 |
| spot | 9, at the mount | **removed** |
| key / fill / rim | 3.6 / 1.2 / 1.5 | 2.4 / 1.0 / 1.2 |
| exposure | 1.0 | 1.3 |
| grade contrast | 1.06 | 1.0 |
| grade vignette | 0.42 | 0.12 |

`ENV_INTENSITY` is 5.0 rather than the 1.0 a viewer would use because this is
not a viewer: it renders through ACES plus a contrast curve and a vignette, and
it sits on a near-black page rather than a viewer's grey room. Matched by eye
against the reference rather than assumed.

**The vignette was the last thing in the way.** The canopy spans the top corners
of the frame, which is exactly where a vignette bites hardest, and at 0.42 it
was pulling the underside back to near-black *after* the lighting had just lit
it. Confirmed by rendering the same frame with it on and off before changing it.

Nothing else moved: FOV 34, the orbit height lock and the material remap are all
as they were.

## 9.1 · The green, matched to a close-up reference

Brightness alone could not get there. The environment is neutral, so every unit
of it that lifts the model also pushes the colour toward white — the model got
brighter and less green at the same time. Measured on the spine (average RGB and
saturation of the lit pixels, sampled from the rendered frame):

| | spine RGB | saturation |
|---|---|---|
| env 5, no saturation | 58, 91, 36 | 0.667 |
| env 5, saturation 1.4 | 48, 94, 21 | 0.844 |
| env 12, no saturation | 76, 129, 41 | 0.743 |
| env 12, saturation 1.5 | 72, 130, 36 | 0.783 |
| **env 9, saturation 1.45** | **59-77, 118-142, 32-34** | **0.82-0.94** |

So the two knobs work together: the environment supplies the brightness and a
saturation term at the end of the grade puts back what it costs. `ENV_INTENSITY`
9.0, ambient 3.0, key/fill/rim 3.0/1.26/1.5, `GRADE_SATURATION` 1.45.

**The ceiling on the environment is set by the flat panels, not the spine.** At
12 the model's glossy panel backs go solid white while the spine is still well
short of clipping. 9 holds the same colour with nothing blown.

### `toneMappingExposure` cannot be tuned at runtime

Worth recording, because it cost a wrong conclusion. Three.js uploads
`toneMappingExposure` inside `setProgram`, guarded by
`if (refreshProgram || _currentCamera !== camera)` — so it is only re-sent when
the shader program or the camera object changes. Setting it live and re-rendering
does nothing at all: sweeping 0.5 → 3.0 produced byte-identical output, on a
freshly loaded page, while `envMapIntensity` over the same range moved the image
hugely.

The shipped value **is** applied — it is uploaded when the program is first
used. It is only *live* changes that are inert. The first read of that
measurement was that ACES was not affecting the image and tone mapping should be
swapped; that was wrong, and the four-way tone-mapping comparison that appeared
to support it was invalid for the same reason. Change it in the source and
reload.

### The white flare at yaw 0 is not from this change

At the head-on angle about 10% of lit pixels sit at full white on the panel
backs — grazing-incidence reflection off flat glossy geometry. Checked against
the previous configuration before assuming it was a regression: env 5 with no
saturation gives **10.57%** against the shipped **10.01%**, and hiding the video
screens changes neither. It predates this work and this change slightly reduces
it.

# 10 · Everything artificial taken back off the model

Asked to remove the glow and the fake colour and render the GLB as it actually
is. Four things were doing it, and all four are gone.

**The material remap.** §7.11 scaled metalness to 0.15 and lifted roughness into
a 0.42-0.90 band. It was there because the asset's own MR map is a near-mirror
(metalness 0.961 median, roughness 0.020) and a mirror shows its surroundings
rather than its own colour. But rewriting the material the asset shipped with is
not the fix for that — giving it an environment worth reflecting is, which
`RoomEnvironment` now does. The maps are used exactly as authored: `metalness`
and `roughness` both 1.0 against the map, emissive black, colour multiplier
white, no `onBeforeCompile` at all.

**The saturation push.** `GRADE_SATURATION` 1.45 → 1.0. It made the green vivid,
but vivid is not what the basecolor contains; it was inventing colour.

**The split-tone.** It multiplied a cool tint into the darks. Removed from the
shader; both colour uniforms are now white and unread.

**The bloom.** `UnrealBloomPass` is no longer added to the composer at all,
rather than run at strength 0, so its blur chain costs nothing. It was the last
thing in the frame adding light the model does not emit.

Verified on the shipped build: composer chain is `RenderPass, FilmPass,
ShaderPass` with no bloom; material reports metalness 1 / roughness 1, no remap
attached, emissive `000000`, colour `ffffff`; grade reports saturation 1.0,
contrast 1.0, both tints `ffffff`.

## 10.1 · What that costs, and why

**It is much darker, and that is the asset.** A metal has no diffuse response,
so the ambient and the three directional lights contribute almost nothing —
they matter only where the metalness map dips (10th percentile 0.573). The
environment is doing all of it, and a mirror can only show what is around it.
A default viewer puts the model in a lit grey room; this puts it on a black
stage.

**Raising the environment does not rescue it.** Measured on the spine:

| env | spine RGB | green clipped |
|---|---|---|
| 4 | 50, 71, 37 | 11.7% |
| 8 | 57, 79, 42 | 14.4% |
| 14 | 61, 84, 46 | 16.4% |
| 20 | 63, 87, 48 | 17.4% |

Five times the light buys 26% more brightness and throws away half again as much
to clipping. That is what a mirror does: it is either reflecting a light panel,
and blown, or reflecting the dark, and black. `ENV_INTENSITY` 8.0 is where it
reads without throwing more away.

**If it needs to be brighter, the honest lever is the room, not the model** —
brighten the backdrop and the environment so there is more for the metal to
reflect. Reaching for the material or a saturation push is what was just
removed.

Only remaining non-original colour in the frame is the video grade: the screens
are still mapped onto the §2 green tiers (`HERO_ASSETS.screenGrade`). That is
the footage, not the GLB, and was left alone.

## 10.2 · The model's lighting is now abstracted from the scene

Asked to make the asset light the way a viewer lights it — Surrounding =
Studio, Strength = 1 — and to keep the scene and the background out of it.

**There are no lights in the scene at all.** The ambient, key, fill and back are
deleted. Nothing in this file can push the asset's lighting around any more; it
is lit by `scene.environment` and by nothing else. That costs nothing elsewhere:
the GLB carries the only `MeshStandardMaterial` in the scene — the backdrop, the
ceiling dome and the light shaft are hand-shaded `ShaderMaterial`s and the video
screens are `MeshBasicMaterial`, so none of them ever took a light.

**The environment is built here rather than taken from `RoomEnvironment`, and
the reason is measured.** RoomEnvironment is a bright grey *room* — big pale
walls. The material is a near-mirror, and a mirror reflecting a white room
returns white, so the asset's green washed out. A studio HDRI is the opposite
shape: a dark surround with a few concentrated softboxes, which is exactly what
the reference's HDRI thumbnail shows. Reflecting mostly dark lets the basecolor
carry and turns the panels into highlights rather than a wash.

| | spine RGB | saturation |
|---|---|---|
| `RoomEnvironment`, strength 1 | 52, 67, 42 | 0.438 |
| studio, surround 0.12 | 35, 55, 23 | 0.575 |
| studio, surround 0.02 | 46, 74, 30 | 0.575 |
| **studio, surround 0.02, brighter boxes** | **81, 113, 59** | **0.602** |

Past that it stops paying: doubling the boxes again reaches 104,134,82 but takes
the clipped fraction from 26% to 36%, and the blue channel climbs with the
green — the wash coming back.

Shipped at `ENV_INTENSITY` 1.0 (Strength 1), surround 0.02, four softboxes.
Across the orbit the spine reads green 89-107 at saturation 0.62-0.90.

### Correction: tone mapping was never the problem

The previous commit's reasoning said ACES was rolling the green toward grey.
That was checked afterwards and it is false: environment-only at strength 1,
ACES measures saturation **0.435** against NoToneMapping's **0.438**. The wash
was the environment's *shape*, not the curve. Tone mapping is off because a
viewer does not apply one, which is a different and much weaker reason. The
source comment has been corrected to say so.

Also off, for the same "nothing sits on top of it" reason: the vignette (0.12 →
0) and the film grain (0.06 → 0).

### One bug this introduced and fixed

Deleting the lights left `window.__lights = { key: keyLight, ... }` in the
`?tune=1` block referring to bindings that no longer exist, which threw
`ReferenceError: keyLight is not defined` on every tune-mode load. Removed. The
console errors that appeared to persist after the fix were stale entries from
the previous page load — confirmed by re-fetching the served file and checking
that the tune block now runs to completion.

# 11 · The hero chrome, built to the supplied design

The overlay that §7 had stripped out is back, laid out against the supplied hero
design rather than the old reference mirror: nav bar, breadcrumb, two rails of
instrument readouts, the headline block, a scroll cue and a status corner.

**It lives inside `#page`.** That is the whole reason the layout holds: chrome.js
scales `#page` by `viewportWidth / 1024`, so the chrome and the 3D stage scale as
one piece and nothing has to be re-solved per breakpoint. Positions are written
in 1024-wide design units.

**`pointer-events` are off on the layer and on again per control.** `#chrome` is
`pointer-events:none` so a drag anywhere still reaches the rig; only `#chrome a`
turns them back on. Without that the nav bar's own background would have eaten
every drag across the top of the scene.

**The accent token moved.** The design's green is a yellower lime than §2's
emerald, so `--accent` went `#19e65a` → `#8ce03c`. Everything that referenced
the token — preloader ring, scrollbar thumb — followed with it, which is the
point of having had it as a token. Three new neutrals joined it: `--ink` for the
headline white, `--line` for the hairline borders and `--mut` for the dim
instrument text.

Structure is semantic rather than a pile of divs: `<header>` as the banner,
`<nav aria-label="Primary">`, a real `<h1>`, and the coordinate readout as a
`<dl>`. The decorative marks — the plus ticks, the dotted rail, the mouse
outline — are CSS pseudo-elements, so there are no icon assets to ship. Both
animations (the scroll wheel, the status pulse) are dropped under
`prefers-reduced-motion`.

**Verified structurally, not visually.** The Browser pane here does not
composite, so a DOM overlay cannot be screenshotted — the QA capture path only
reads the WebGL canvas. What was checked: the accessibility tree carries every
element with the right roles and text; computed `--accent` resolves to `#8ce03c`;
every block's bounding box lands where intended; `#chrome` computes to
`pointer-events:none`; there is no horizontal overflow and `scrollHeight` still
equals the viewport height. The composed appearance is unverified and wants an
eye on it.

**The headline font is a system stack**, `Bahnschrift / DIN Alternate /
Segoe UI Semibold / Impact`. The design's face is a squarer techno display font;
matching it properly means a webfont, and the build currently fetches nothing but
three from a CDN. Worth adding if the exact face matters.
