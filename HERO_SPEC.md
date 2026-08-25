# HERO_SPEC.md — gobold.live HERO SECTION ONLY, green palette (autonomous build)

## Mission
Recreate ONLY the hero viewport of https://www.gobold.live/ — the fullscreen cyberpunk monitor-rig 3D scene plus its visible chrome — recolored from red to the green system in §2. Nothing below the fold. **Ground truth = the local mirror** (`/reference`, built in §1): extract every value from it, never guess; when SPEC and mirror disagree, the mirror wins. Write your own implementation — the mirror is for study and measurement only; no code, copy text, or media from `/reference` ships in the build (placeholders until finals land in `/assets-final/`). Log any value found nowhere in `DECISIONS.md`.

## 1. Bootstrap (run once, first)
```bash
mkdir -p reference/{models,videos,fonts} assets-final placeholders
B=https://www.gobold.live
curl -sL $B/ -o reference/index.html
for p in models/cyberpunk_screens.gltf models/baseColor_1.jpg \
  videos/9765.mp4 videos/677.mp4 videos/693.mp4 videos/766.mp4 \
  fonts/pl.otf ; do curl -sL "$B/$p" -o "reference/$p"; done
```
`/reference` = read-only, git-ignored, never served. Inspect `reference/index.html` for: the hero markup, the first `<style>` block (chrome layout rules), and the hero `<script type="module">` (the one importing UnrealBloomPass/BokehPass/FilmPass/AfterimagePass — every scene constant lives there). Inspect the gltf with a script for node names/transforms; ffprobe the videos for dims/duration.

## 2. GREEN TOKEN SYSTEM (full red→green mapping — apply everywhere, no exceptions)
| Role | Original | Green build |
|---|---|---|
| Signal accent (UI text, borders, active states) | `#ff0000` / `#ff2b2b` | `#19e65a` |
| Hot accent / hover | `#ff4040` | `#4dff8a` |
| Deep accent | `#7a1414` | `#145c2e` |
| Near-black accent wash | `#3a0000` / `#080000` | `#06140b` / `#010803` |
| WebGL rim light | `0xff4d4d` | `0x4dff7a` |
| WebGL fill light | `0xff1a1a` | `0x1aff5e` |
| Ambient | `0x404060` | `0x405a4a` (cool green-grey) |
| Floor laser lines + neon ring | red | `#19e65a`, emissive |
| Mint-white hot tier (bloom cores, ring core) | — | `#b8ffcc` |
| Neutrals (unchanged) | `#000` bg · greys `#a2a2a2 #818181 #6a6a6a` · white `#e9eaec` | same |
Rule of the palette: black stage, grey information, **green is the only emotional color** — exactly one accent hue in the whole viewport.

## 3. LAYOUT SHELL
- **1024 design canvas:** author everything at 1024px width; on load/resize compute `s = viewportWidth/1024` and scale the root via `transform: scale(s)` (use `zoom` only on Chromium/Firefox desktop; Safari + all touch → transform, body height set manually to the scaled footprint). Coarse-pointer devices: rewrite viewport meta to `width=1024` so phones get the desktop composition scaled.
- Hero = 100vh (design-space equivalent), scene canvas fullscreen behind the chrome, `#000` base.

### Chrome (positions/sizes: extract exact px from the mirror's first style block; observed composition below)
- **Top-left, one line:** brand word `[YOUR MARK]™` in the heavy condensed display face (grey `#a2a2a2`), followed by an all-caps tagline in the same face, slightly lighter grey. [CONTENT SLOT ×2]
- **Under it, left:** three ~34px circular badges, white line-art icons in thin circles (thin ring, transparent fill). [CONTENT SLOT: 3 icon motifs]
- **Top-right cluster,** mono font, right-aligned: small toggle switch + `MUSIC OFF` (grey) · a bordered box `◐ INVERT SITE` (green border + green text, transparent fill) · email in green mono [CONTENT SLOT] · a thin green tick at the screen edge.
- **Right edge, vertically centered:** minimap — 6 right-aligned labels (`MAIN ABOUT TEAM FAQ SERVICES CONTACT`) in ~8px mono grey, each with a short dash tick on its right; active item + tick = green. Hero-only build: render all six, wire only visual active state (MAIN active).
- **Dead center:** `✛ THERMAL EFFECT` pill — black fill, white ~10px letter-spaced mono, crosshair glyph left; hover = green text. (Keep the label even though the green build's effect is night-vision — or relabel `NIGHT VISION`; pick one, log it.)
- **Bottom-left:** circular stamp badge ~120px, white line art + circular text on path, slow constant CSS rotation (~12s/rev linear infinite). [CONTENT SLOT: stamp art/text]

## 4. THE 3D SCENE (Three.js 0.158 via importmap, exactly as the original)
```html
importmap: "three": unpkg three@0.158.0 ESM · "three/addons/": unpkg examples/jsm/
```
**Model:** monitor rig — 4 CRT monitors + desk dressing, one baked baseColor texture. Build with a placeholder (boxes matching the reference gltf's measured node bounds) until `assets-final/monitor-rig.glb` lands (screens = 4 flat quads named `SCREEN_1..4`, UV 0–1).

**Screens = video textures** (muted, looped, `playsInline`, retry-on-error play). Exact plane transforms (verify against mirror):
```
s1 scale(0.690,0.644,1) pos(-0.033,0.144, 0.636) rot( 0.318, 0.020,-0.020)
s2 scale(0.860,0.640,1) pos( 0.905,0.140,-0.144) rot(-1.260, 1.775, 1.260)
s3 scale(0.870,0.650,1) pos(-0.795,0.188,-0.183) rot(-1.190,-1.860,-1.210)
s4 scale(0.689,0.644,1) pos( 0.117,0.144,-0.830) rot(-0.240, 0.000, 0.000)
```
Placeholder loops: ffmpeg-generated green/white high-contrast test patterns until finals land (`screen-a..d.mp4`; primary = the front screen, preload it).

**Camera + intro:** `PerspectiveCamera(28.5, ar, 0.1, 100)`. Intro: camera starts pushed out along screen s3's normal → **4000ms eased dolly** to `(-2.62, 0.762, -2.145)`, no hold (`INTRO_HOLD=0`); from t=0.45 a quadratically-ramping spin accumulates so the dolly blends seamlessly into idle auto-rotation. Idle: orbit about the controls target at `SPIN_RATE = 2π·0.6/60 rad/s`; OrbitControls with polar clamps; auto-rotation pauses while the user drags.

**Lights (green build):** Ambient `0x405a4a` @0.3 · SpotLight white @**40** at `(0,3,0.5)` targeting origin · rim Directional `0x4dff7a` @1.2 from `(-2,2,-2)` · fill Directional `0x1aff5e` @0.8 from `(2,1,2)`. The green rim/fill pair is the signature edge glow.

**Floor:** procedural pentagram line-art + neon ring in `#19e65a` (core `#b8ffcc`), sized from the frustum: `visW = 2·tan(fov/2)·|camPos|·aspect` so it always fills view. *(Optional one-line swap: replace pentagram with your own emblem geometry, same line material.)*

**Scroll/mouse parallax** — monitors in a `rig` group, floor excluded:
```
rig.rotation.x += ((scrollY*0.0005 + mouseXsmoothed*0.045) - rig.rotation.x) * 0.07
rig.rotation.y += ((scrollY*0.0004) - rig.rotation.y) * 0.07   // no mouse pan on Y
```

**Post chain (EffectComposer, this exact order):**
```
RenderPass
→ BokehPass      { focus: 1.2, aperture: 0.00077, maxblur: 0.01 }
→ UnrealBloomPass( strength 0.8, radius 0.6, threshold 0.2 )
→ FilmPass       ( 0.55, 0.023, 700, false )
→ NightVision ShaderPass (custom, §5)
→ AfterimagePass ( 0.93 )   // enabled only while night-vision is on
```
Renderer `{antialias, alpha, powerPreference:'high-performance', stencil:false}`, **DPR hard-capped 1.0**. Pre-warm the night-vision + afterimage passes one frame so first toggle doesn't hitch.

## 5. NIGHT-VISION TOGGLE (green analog of the thermal effect)
Fullscreen ShaderPass, uniforms `{uAmount, uTime}`; luminance-driven false-color ramp:
```
black → #02160b → #0a3d1f → #148f43 → #19e65a → #8affb0 → #eafff2 (white-hot)
```
plus horizontal row-glitch tears riding on top (thin random rows offset laterally, intensity ∝ uAmount). Behavior: button toggles; ON → `uAmount += (1-uAmount)*0.08` per frame (eased in), Afterimage `damp = 0.93 * uAmount` (ghost trails only while on); OFF → snap instantly (`uAmount=0`, afterimage disabled) — no fade-out. Extract the original thermal shader's structure from the mirror for the exact tear/ramp math; only the color stops change.

## 6. OTHER INTERACTIONS
- **INVERT SITE:** flips the theme — DOM neutrals invert (black stage ↔ paper white via root filter or token swap), WebGL accents flip green ↔ white by patching a `uTheme` uniform into the line/accent materials (`onBeforeCompile`, `color_fragment` include) — never CSS-invert the canvas.
- **MUSIC toggle:** wire the switch + equalizer-bar animation; audio source = `assets-final/music-loop.mp3` when present, silent stub otherwise.
- rAF loop gated by document visibility; videos pause offscreen.

## 7. PERFORMANCE BUDGET
DPR 1.0 · placeholder/final GLB ≤100k tris · videos 720p ≤5MB each · one WebGL context · post passes exactly the six listed · target 60fps on mid-tier laptop, no long tasks after intro. The grain/scanline aesthetic hides the low DPR — don't raise it.

## 8. ASSETS (finals dropped into /assets-final/, hot-swapped on arrival)
| File | Spec |
|---|---|
| `monitor-rig.glb` + `monitor-rig_basecolor.jpg` | 4 CRTs + desk junk, screens = named quads `SCREEN_1..4`, ≤100k tris, bake ≤2048 |
| `screen-a..d.mp4` | 5–15s seamless loops, no audio, 720p ≤5MB, **green/white/black** high-contrast content |
| `display.otf` | licensed condensed brutalist display for the brand/tagline role (re-tune ascent/descent overrides to its metrics) |
| `logo.svg` / stamp art / 3 badge icons / `music-loop.mp3` | brand pack; favicons derived from logo |
Until then: procedural placeholders for everything (build never blocks).

## 9. ACCEPTANCE
Side-by-side with the live hero at 1024 / 1440 / 390 widths: identical composition, intro timing, orbit feel, parallax response, bloom/grain character, and toggle behaviors — with every red swapped to the §2 green and zero mirrored files served. Screenshot each width into `/qa` per iteration; stop when diffs are only palette + placeholder content.
