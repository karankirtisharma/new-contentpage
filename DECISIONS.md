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
