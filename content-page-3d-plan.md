# Cyphernaut — Content Creation & Media Production
## Full 3D scroll-site plan: asset audit → concept → choreography → stack → pipeline → build order

Prepared 2026-08-29 for VVayn / Cyphernaut. Built from direct inspection of the 10 Tripo GLBs supplied in this session, the section-7 service copy, the existing Cyphernaut page conventions (services hub, tokenomics subpage motion rules, neon-pillars scene, house style), and current (2026) research on award-level WebGL/scroll sites and the Three.js / R3F stack.

> What did **not** arrive in the session: the source images (`...\images of 3d model content page\ruddier`) and the reference page/design. The Chrome connector timed out, so neither could be opened locally. Every model below was identified from its own geometry and textures; Tripo names exports after the source image, so the mapping is reliable, but Tripo's fidelity to your originals could not be graded. Section 12 lists what changes once those arrive.

---

## 0. Executive decisions (read this if nothing else)

1. **Use 6 of 10 models. Exclude 4.** Five stations + one fly-through portal. Two of the ten are duplicates of each other, two are weaker versions of things a better model already does.
2. **Concept: "The Signal Line."** One continuous studio floor in a void; six machines along an S-curve, all plugged into one glowing conduit. Scroll = a camera dolly along that conduit. Final chapter cranes up to reveal the whole line — the "Research → Strategy → … → Optimization" engine sentence from your copy, shown instead of said.
3. **The models need three fixes before they are usable**, all tested here: decimate 1.9M → ~150k tris (8%, error 0.0005), drop the normal maps (they are flat), and **derive an emissive map from the green panels** (Tripo shipped none — without it the screens are dull grey-green). Per-asset emissive strengths are calibrated in §6.
4. **Stack: Next.js + R3F v9 + drei + @react-three/postprocessing + GSAP ScrollTrigger + Lenis.** WebGL2 renderer with a WebGPU flag. Code-defined camera splines with a keyframe JSON, not Theatre.js, not drei ScrollControls. Rationale in §8.
5. **Budget**: ~2 MB per model (meshopt + 2K textures), hero interactive < 2.5 s, ≤ 2 stations in frustum at any time, 60 fps desktop / 45+ fps iPhone-13-class with mobile variants.

---

## 1. Asset audit

### 1.1 Raw file facts (identical structure across all 10)

| Property | Value |
|---|---|
| Generator | Tripo (image-to-3D) |
| Scene graph | 1 node, 1 mesh, 1 primitive, 1 material each |
| Geometry | 0.95–1.04 M vertices, 1.82–1.98 M triangles each; **~19.1 M triangles total** |
| File size | 56.9–63.4 MB each; **605 MB total** |
| Attributes | POSITION, NORMAL, TEXCOORD_0 (no vertex colour, no tangents) |
| Textures | basecolor 8192², roughness/metal 4096², normal 4096² (all JPEG) |
| Material | metallicFactor 1.0 × RM map, roughnessFactor 1.0 × RM map, no emissive, OPAQUE, single-sided |
| Extensions | `KHR_materials_volume` (unused), `FB_ngon_encoding` |
| Animations / skins | none |
| Bounding box | every model normalised to ~0.98 units on its longest axis, base at y = 0 |

Per-model dimensions (W × H × D, units):

| File | Tris | W × H × D |
|---|---|---|
| camera_rig | 1,867,348 | 0.979 × 0.415 × 0.664 |
| futuristic_control_desk | 1,938,411 | 0.980 × 0.440 × 0.959 |
| futuristic_control_ring | 1,952,084 | 0.979 × 0.646 × 0.982 |
| futuristic_control_table | 1,860,777 | 0.984 × 0.169 × 0.852 |
| futuristic_machinery | 1,815,722 | 0.981 × 0.284 × 0.978 |
| futuristic_space_station | 1,975,832 | 0.980 × 0.422 × 0.978 |
| green_technical_device | 1,938,540 | 0.623 × 0.978 × 0.627 (only vertical model) |
| sci-fi_control_console | 1,818,539 | 0.984 × 0.178 × 0.864 |
| sci-fi_control_table | 1,984,350 | 0.980 × 0.517 × 0.848 |
| sci-fi_prop | 1,924,782 | 0.981 × 0.911 × 0.970 |

### 1.2 Model identification, quality and verdict

Rendered headless in Three.js (SwiftShader) from four angles each — see `00_asset_audit_sheet.jpg`. Hero looks with derived emissives — see `01_hero_looks_sheet.jpg`.

| # | File | Identified as | Read / metaphor | Quality notes | Verdict |
|---|---|---|---|---|---|
| 1 | `sci-fi_control_table` | Tilted drafting / light table; holographic storyboard surface with panels, papers, a mug; **fully-sculpted Cyphernaut** (helmet, backpack, hand resting on the table) standing at its side | Creative direction, scriptwriting, storyboarding, the strategist at work | Best geometry and best figure in the set. Surface panels read as storyboards after emissive derivation | **USE — character anchor (Chapter 1)** |
| 2 | `camera_rig` | Large-format cinema camera on a rail base: lens barrel, three bellows-style frames/matte box, film magazine block, a row of small slates/filter cards at the front | "We make things seen." The camera looking back at the viewer | Iconic silhouette from every angle; lens reads clearly head-on | **USE — hero (Chapter 0)** |
| 3 | `futuristic_control_ring` | Circular turntable stage under a lit canopy ring (softbox), two robotic camera arms, keyboard/mixing console at the front, central disc platform | A recording / virtual-production stage: podcast, talking-head, product shoot | Many thin struts — needs the conservative decimation; canopy and turntable are large pale areas that bloom easily | **USE — production stage (Chapter 2)** |
| 4 | `futuristic_machinery` | Flat industrial rig: a row of lit rectangular panels on a rail, green cables fanning from a single hub cube to each panel, a turret on the side | **One source → many outputs.** Content repurposing / distribution machine | Cables are thin cylinders — decimation-sensitive but survived at 8% | **USE — multiplier (Chapter 3)** |
| 5 | `sci-fi_prop` | Tilted concentric-ring dish / orrery on a pedestal; node beads on the outer rings; three-spoke turbine core | Broadcast array / signal dish; nodes = platforms; orrery echoes the Cyphernaut "planets orbiting the sun" cosmology | Clean rings; excellent loop asset (spin) | **USE — distribution array (Chapter 4)** |
| 6 | `green_technical_device` | Vertical gantry booth on a ring base: camera on a boom, angled teleprompter screen, side light panels | Founder / talking-head recording booth; also a frame the camera can fly through | Only portrait-format asset; 18.9% of its texture is lit panel — must run at low emissive | **USE — fly-through portal between Chapters 2→3** |
| 7 | `futuristic_control_desk` | Crescent command desk with green wall screens, one standing helmeted figure inside the curve | Command centre | Figure is melted/low-fidelity; desk competes directly with #1 for the same role | **EXCLUDE** (keep as backup if #1 fails segmentation) |
| 8 | `futuristic_space_station` | Round council table, **three astronauts** around it, holographic sculpture, node-network diagrams on the surface | Community / DAO round table | Tripo struggled: smeared figures, mushy chess-piece details, dark blue-charcoal texture | **EXCLUDE** from load budget. Optional: far-background silhouette in Chapter 4 if the community story needs it |
| 9 | `futuristic_control_table` | Flat holo-slab with two detached floating side monitors and a tiny figure | Planning table | Flat, low silhouette; figure is a smudge | **EXCLUDE — duplicate of #10** |
| 10 | `sci-fi_control_console` | Same source image as #9, second Tripo run (bbox 0.984×0.178×0.864 vs 0.984×0.169×0.852; identical layout) | — | Same as #9 | **EXCLUDE — duplicate** |

**Why six and not more**: two stations in the frustum at once is the performance ceiling for 150k-tri models with bloom on mid-range hardware. Six stations along a line is the most the page can hold and still give each machine a full "beat" (entrance → hold → exit). Anything more becomes decoration.

**Recurring character**: the Cyphernaut appears baked into #1, #7, #8, #9/10 at different scales. Only #1's version is good enough to hold a close-up. He appears once, at the drafting table, and the page returns to him in the finale crane. His stillness is deliberate — the machines move, the director doesn't.

### 1.3 Structural findings that change the build

**Mesh topology.** Every model is a patchwork of hundreds of disconnected micro-islands (camera rig 1,326 islands; largest island in any model < 3% of faces). Connectivity-based splitting therefore cannot separate the figure from the table, the canopy from the stage, or the rings from the array. Two working options:
- **Tripo Studio → Part Segmentation → per-part Retopology** (segmentation ≈ 80 credits; retopo yields 15–30k-face game meshes with clean edge flow). Best path for the three models that benefit from independent parts (table figure, stage canopy/arms, array rings).
- **Blender**: import, Edit mode, box/lasso select the spatially isolated part (figure occupies x < −0.16 on the table; side monitors on #9 are detached), `P → Selection`. Works because parts are spatially isolated even though they are not topologically distinct.

**Normal maps are empty.** Sampled the table's normal map: mean RGB (127.7, 127.0, 253.6), σ ≈ 5. That is a flat normal with JPEG noise. Drop `normalTexture` on all six — saves a 4K texture and its VRAM per model, zero visual loss.

**Roughness/metal maps are patchy.** Channel stats: R = 255 (unused AO slot), G roughness mean ≈ 0.43 with per-UV-island patchiness, B metallic mean ≈ 0.08. The models are dielectrics. The per-island roughness patches produce smeared, blotchy speculars. Recommendation: replace the RM map with constants `roughness 0.45, metalness 0.10` and let the basecolor carry detail. Keep the RM map at 1K as an A/B for the first build only.

**No emissive map.** Under PBR lighting the green screens render as dull grey-green and the whole point of the models (lit sci-fi panels) is lost. Fix: derive an emissive map from the basecolor — pixels where `G − max(R,B) > 0.07` and value `> 0.22` — tinted toward acid green and injected as `emissiveTexture` with `KHR_materials_emissive_strength`. Script and per-asset strengths in §9.3. Mask coverage measured: table 1.5%, camera 2.5%, stage 3.6%, machine 5.9%, array 11.6%, booth 18.9%. Coverage predicts how hot each model runs; the high-coverage models need strengths ≤ 0.6.

**Decimation quality.** meshoptimizer simplify at ratio 0.08 / error 0.0005 keeps all silhouettes, thin struts and cables at 145–170k triangles. Ratio 0.05 begins to facet curved surfaces (visible on the crescent desk). Mobile variant at ratio 0.04 is acceptable at distance with fog.

Web builds produced in this session (simplify 0.08 → resize 2048 → WebP q82 → meshopt high):

| Model | Tris | Size |
|---|---|---|
| camera_rig | 149,380 | 1.99 MB |
| sci-fi_control_table | 158,744 | 1.74 MB |
| futuristic_control_ring | 168,648 | 2.13 MB |
| futuristic_machinery | 145,256 | 1.91 MB |
| sci-fi_prop | 161,284 | 1.92 MB |
| green_technical_device | 155,066 | 2.01 MB |
| **Total** | **938k** | **11.7 MB** |

WebP is a transfer format only — each 2K RGBA texture still occupies 16 MB of VRAM. Production uses KTX2 (§9.2), which cuts VRAM 4–6×.

---

## 2. Concept: "The Signal Line"

### 2.1 Narrative
Cyphernaut's content engine is a line: *Research → Strategy → Concept → Script → Design → Production → Editing → Publishing → Distribution → Analytics → Optimization.* The page is that line made physical. Six machines stand on a studio floor that recedes into a void, connected by a single green conduit — **the Signal**. The visitor is the camera on the dolly; scrolling moves them down the line. A pulse of light travels the conduit at exactly the scroll position, so the visitor is always "where the signal is". The final chapter cranes up and back: the whole line is visible at once, every machine pulsing in sequence, and the CTA is "Plug into the engine."

Cyphernaut-lore fit: the conduit is the weak signal from the origin story; the array is an orrery (planets orbiting the sun); the Cyphernaut himself is at the drafting table, not on camera — the studio's stance that the client is the star.

### 2.2 Visual direction
- Void `#050607`. Single accent: acid green (emissives, conduit, UI). No second colour — same discipline as the tokenomics page.
- Materials: gunmetal dielectric PBR from Tripo basecolors, constant roughness 0.45 / metal 0.10, derived emissives.
- Floor: dark glossy plane (`roughness 0.25, metalness 0.6`), plus a **low-res planar reflection under the hero only** (`MeshReflectorMaterial`, resolution 384, blur [300, 100], mixBlur 1) — reflections are dropped after Chapter 0 to save the second scene render.
- Fog: `FogExp2 #050607, density 0.14` — back stations dissolve; density rises to 0.155 with scroll velocity for a speed cue.
- Atmosphere: ~2,000 GPU dust motes (Points, soft sprite, additive, slow drift), fake volumetric cones on the stage and booth (additive radial-gradient cones, no real volumetrics).
- Lighting rig (global, three lights + IBL): key SpotLight white 40, position (2.5, 4, 2.5), penumbra 0.6; rim DirectionalLight `#7dffa0` 2.0 from (−3, 2, −3); fill DirectionalLight `#3a4a5a` 0.6; RoomEnvironment PMREM at intensity 0.35 (or Poly Haven `studio_small_09` 1K, CC0). ACES tone mapping, exposure 1.1.
- Type: IBM Plex Mono for chapter labels (11 px, letter-spaced caps), Plex Sans for headlines (two-weight stacks). Text reveals by clip-path / weight shift, never translate-in.
- Excluded per house style: coins, neon tube lettering, padlocks, AI-brain clichés, particle "geysers".

### 2.3 Motion rules (inherited from the locked tokenomics direction)
1. One persistent through-line across every section boundary → the Signal conduit.
2. One focal moment per section → listed per chapter in §5.
3. Unique reveal signature per section → iris / holo-card lift / monitor fade-up + cone swell / sequential ignition / radar sweep + counters / crane + fog lift.
4. Asymmetric eases: entrances `power3.out`, holds linear, exits `power2.in`.
5. Type animated by mask, clip or weight — not sliding.

---

## 3. Page structure and service mapping

Total scroll ≈ 900 vh (six chapters × ~150 vh). Scroll position is normalised to master `t ∈ [0, 1]`.

| Chapter | Station | Services folded in (from section 7) | `t` range |
|---|---|---|---|
| 0 — Hero: *"What we make people see"* | Camera rig, lens toward viewer | Page title + one line | 0.00 – 0.12 |
| 1 — DIRECT | Drafting table + Cyphernaut | 7.1 Content Strategy & Creative Direction · 7.11 Graphic Design & Visual Content | 0.12 – 0.30 |
| 2 — PRODUCE | Stage, then Booth as exit portal | 7.2 Promotional & Advertising · 7.3 Motion Graphics · 7.4 Educational & Explainer · 7.12 Video Production & Post · 7.8 Talking-Head & Founder · 7.9 Podcast · 7.10 Livestreams & Virtual Events · 7.7 UGC & Creator-Led | 0.30 – 0.55 |
| 3 — MULTIPLY | Machine | 7.15 Content Repurposing · 7.5 Social Media · 7.6 Long-Form Written · 7.16 Localization & Regional | 0.55 – 0.72 |
| 4 — DISTRIBUTE & MEASURE | Array | 7.17 Distribution & Publishing · 7.18 Analytics & Optimization · 7.13 Community & Ecosystem · 7.14 Developer & Technical | 0.72 – 0.88 |
| 5 — THE ENGINE | Crane reveal of the whole line | End-to-End Content Engine paragraph + CTA | 0.88 – 1.00 |

### 3.1 Copy density rule ("text is the enemy")
Each chapter shows: label (mono caps) · one headline (max 2 lines) · max 2 sentences · **6–8 capability chips** (the highest-signal bullets). A "See all N →" control opens a drawer with the complete bullet list for that chapter. The drawer keeps every one of the ~250 bullets in the DOM for SEO and completeness without putting them on the canvas.

Suggested chip sets:
- DIRECT: Content strategy · Campaign concepts · Editorial calendar · Creative direction · Storyboarding · Key visuals · Infographics · Pitch decks
- PRODUCE: Launch trailers · Animated explainers · Tokenomics animations · Founder videos · Podcast production · Livestreams & AMAs · UGC campaigns · Colour, sound, VO
- MULTIPLY: Shorts / Reels / TikTok · X threads · Carousels · Newsletters · Audiograms · Blog & thought-leadership · Whitepaper summaries · 10+ languages
- DISTRIBUTE & MEASURE: YouTube management · Cross-platform scheduling · Governance explainers · Developer tutorials · Watch-time analysis · Hook & thumbnail testing · Monthly reports · Ongoing optimisation

---

## 4. World layout

Scene units = metres. Models are 1-unit bboxes; scale factors below make each read at hero size from ~3.5 units away. Stations sit on a gentle S-curve so no two are aligned along the camera axis.

| Station | Position (x, y, z) | Rotation Y | Scale | Notes |
|---|---|---|---|---|
| Camera rig | (0, 0, 0) | faces +Z | 3.0 | lens front at z ≈ +1.0 |
| Drafting table | (−6, 0, −6) | +35° | 3.2 | Cyphernaut on the camera-facing side |
| Stage | (5, 0, −13) | −20° | 3.4 | turntable axis at model centre |
| Booth (portal) | (0, 0, −19) | 0° | 3.6 | camera passes through the frame at y ≈ 0.9 |
| Machine | (−6, 0, −26) | +25° | 3.2 | hub cube toward the conduit |
| Array | (5, 0.4, −34) | −30° | 3.0 | dish tilt faces the camera path |
| Signal conduit | CatmullRomCurve3 through six "port" points (one per station, at its base facing the path), radius 0.05, TubeGeometry 400 × 8 | — | — | custom shader: dark green base `#0d2a17`, pulse of width 0.06 (in curve-param space) at `u_progress = t`, emissive `#7dffa0` × 4 |
| Floor | plane 80 × 80 centred at (0, 0, −17) | — | — | glossy dark; reflector only in Chapter 0 |

Visibility policy: a station is `visible` only while its chapter is within one chapter of the camera; earlier stations are hidden, not disposed. The fog guarantees ≤ 2 stations legible at once.

---

## 5. Camera choreography

Two `CatmullRomCurve3` splines (position and look-target) sampled by an eased master `t`. The ease is piecewise: plateaus at each station where `dt` flattens so the camera **holds** and performs a slow ±4° orbit with **mouse parallax** (±0.12 rad, lerp 0.06). Smoothing: `tSmooth += (tRaw − tSmooth) × 0.08` per frame (Lenis lerp 0.08 on the DOM side).

| `t` | Camera position | Look at | Beat |
|---|---|---|---|
| 0.00 | (0, 0.7, 3.2) | lens centre | **Loader = aperture iris** drawn in DOM/SVG. Iris opens onto the lens looking back at the viewer. Emissives power on in sequence (slates → matte box → lens ring) over 1.4 s |
| 0.06 | (1.2, 1.0, 2.6) | rig centre | title splits off the lens on a clip mask |
| 0.12 | (2.5, 1.4, 1.5) | rig centre | dolly-arc right; hero exits behind |
| 0.20 | (−3.5, 0.9, −2.5) | table surface | low tracking shot across the glowing storyboard toward the Cyphernaut |
| 0.28 | (−4.5, 2.6, −3.0) | figure's visor | rise into an over-the-shoulder; **holo-card lift**: chips rise off the table |
| 0.32 | (−1.0, 1.8, −6.5) | stage | transit; conduit pulse leads the eye |
| 0.40 | (3.0, 1.6, −9.5) | stage centre | **hold**: turntable rotates; three floating monitors fade up with reels; spotlight cone swells |
| 0.50 | (0.5, 1.0, −16.5) | booth centre | approach the booth head-on |
| 0.55 | (0, 0.9, −20.5) | forward (−Z) | **fly-through**: booth light panels flash to 1.0 as the camera crosses its plane — the 2→3 transition |
| 0.63 | (−2.5, 1.8, −23) | hub cube | machine lights its hub, then panels ignite left→right as `t` advances; format labels appear per panel |
| 0.70 | (−4.0, 2.4, −24) | panel row | hold; chips |
| 0.78 | (3.5, 1.9, −31) | dish core | **radar sweep**: array wobble-spins; node beads twinkle; four counters tick up in DOM |
| 0.86 | (2.0, 3.0, −29) | array | hold |
| 0.92 | (−1, 9, −12) | (−1, 0.6, −18) | **crane** up and back; fog density eases 0.14 → 0.10; all six emissives pulse in order along the Signal |
| 1.00 | (−1, 10.5, −8) | same | hold; CTA "Plug into the engine" |

Implementation detail: store this table as `camera-keys.json` (`t`, `pos`, `look`, `hold: boolean`). Build both splines at boot; a dev-only Leva panel scrubs `t` and nudges points; `?debug=1` shows the spline and station bounds.

---

## 6. Per-station motion, materials and interaction

Emissive strengths below are calibrated from the hero renders (`01_hero_looks_sheet.jpg`) with bloom intensity 0.55, threshold 0.85, exposure 1.1. Coverage % = share of the texture that is lit panel.

| Station | Emissive strength | Coverage | Idle motion | Section-enter signature | Interaction |
|---|---|---|---|---|---|
| Camera rig | **1.3** | 2.5% | 0.3 px "running camera" jitter (noise on position, 4 Hz); a **procedural iris ring** (12 blade planes built in code, not in the GLB) rotates with scroll velocity | slate emissives flicker at 8 Hz for 200 ms; power-on sequence on load | hover anywhere in hero → focus pull (bloom radius 0.6 → 0.9, DOF-free) |
| Drafting table | **2.6** | 1.5% | screen emissive breathes 2.3 ↔ 2.9 at 0.4 Hz (hologram); Cyphernaut static | holo-card lift: 8 chips as drei `<Html transform occlude>` rise 0.3 units from the surface with 60 ms stagger | hovering a chip pulses the table emissive +0.6 for 300 ms |
| Stage | **0.5** (mask the turntable disc from the emissive in Blender or via UV-region multiply; only the canopy ring and console should glow) | 3.6% | whole model rotates 0.15 rad/s (it *is* a turntable); canopy breathes; fake spotlight cone opacity 0.08 ↔ 0.14 | three 16:9 planes orbit at r = 2.2, y = 1.3, fade up 0.4 s apart, playing **real Cyphernaut reels** (muted, loop, `VideoTexture`, 720p H.264/AV1, lazy-loaded on chapter approach) | click a monitor → lightbox reel with sound |
| Booth | **0.55** | 18.9% | none (transition device) | panels flash to 1.0 for 250 ms as the camera crosses z = −19 | none |
| Machine | **0.9** | 5.9% | cable emissive gradient `u_seq` runs hub → panels with `t`; each panel ignites when `u_seq` passes it | sequential ignition left→right; labels appear per panel: Shorts · X thread · Carousel · Newsletter · Audiogram · Blog · Reel · Localized cut | hover a label → its panel pulses; others dim to 0.6 |
| Array | **0.6** | 11.6% | Y-spin 0.08 rad/s (dish is tilted, so Y-spin reads as a radar sweep); accelerates with scroll velocity, damped 0.9; bead twinkle via emissive noise | four DOM counters (watch-time, retention, platforms, languages — or client numbers when available) tick with `t` | none |
| Signal conduit | ×4 (`#7dffa0`) | — | pulse position = `t`; faint secondary pulses every 4 s | — | — |
| Global | — | — | dust motes drift; fog +10% with scroll velocity; chromatic aberration ≤ 0.002 with velocity | — | custom cursor = viewfinder brackets; keyboard: ↑/↓ and PgUp/PgDn step chapters |

**Emissive tint**: derived emissive is multiplied by `(0.62, 1.0, 0.70)` so pastel-green panels read as acid green under bloom instead of white.

**Upstream improvement (optional, ~1 hour + ~240 Tripo credits)**: run the table, stage and array through Tripo Studio Part Segmentation → Retopology. Independent parts unlock: canopy ring counter-rotation and camera-arm sway on the stage; each array ring at a different speed; the Cyphernaut as a separate node (so he can turn his head toward the camera in the finale). Not blocking — the plan works with the monolithic meshes.

---

## 7. UI layer, copy, accessibility, SEO

- **Layout**: full-viewport fixed `<Canvas>` (z 0) under a DOM layer (z 1). Each chapter is a 150 vh section; text blocks are pinned via ScrollTrigger within their chapter and animated on the same master timeline as the camera.
- **Chapter block**: label · headline · ≤ 2 sentences · chip row · "See all N →". Drawer slides from the right (DOM), pauses parallax while open.
- **Nav**: minimal top bar (Cyphernaut wordmark, "Services", CTA). A thin vertical progress rail on the right shows the six chapter ticks; the active tick glows and the Signal pulse position is mirrored on it.
- **Cursor**: viewfinder brackets that expand on interactive targets.
- **Reduced motion** (`prefers-reduced-motion`): scroll scrub disabled, camera snaps to per-chapter poses on section enter with a 0.4 s crossfade; chips visible immediately; no jitter/parallax.
- **No-WebGL / low-end fallback**: per-chapter poster PNGs (renders from the same scene) with the same DOM layer. Detect via `WEBGL_debug_renderer_info` + `navigator.deviceMemory < 4` → serve mobile variants; `< 2` → posters.
- **SEO**: every bullet lives in the DOM (drawers), headings are real `h1/h2`, canvas is `aria-hidden`, chapters are focusable landmarks. Per-chapter `id`s for deep links (`#produce`).
- **Loading**: aperture-iris loader with a real byte-progress ring (drei `useProgress`). Hero rig loads first; the rest preload one chapter ahead of `t`.

---

## 8. Tech stack and the trade-offs behind each choice

| Layer | Choice | Alternatives considered | Why |
|---|---|---|---|
| Framework | **Next.js (App Router)**, TypeScript, Vercel | Vite SPA | You already deploy the hub on Vercel; App Router gives route-level code-splitting and metadata for SEO; the 3D canvas is a client component with `ssr: false` |
| 3D | **React Three Fiber v9 + drei** | vanilla Three.js (Trionn-style) | R3F keeps the six stations declarative and lets Claude Code iterate quickly; the per-frame work is all `useFrame` + refs, so overhead is negligible. Vanilla wins only when you need full manual control of the render loop — not needed here |
| Renderer | **WebGL2 `WebGLRenderer`**, with a `?gpu=1` flag that swaps in `WebGPURenderer` (auto WebGL2 fallback) | WebGPU-first | 2026 guidance says greenfield → WebGPU and three's roadmap puts new features there. But real coverage is ~83% (Firefox on Linux/Android still falls back), pmndrs/postprocessing is WebGL-only, and this page has no compute-heavy need. WebGL2 de-risks the build; the TSL `RenderPipeline` migration is a documented later step |
| Scroll | **GSAP ScrollTrigger + Lenis** (Lenis driven from `gsap.ticker`, `lagSmoothing(0)`) | drei `ScrollControls` | ScrollControls creates its own scroll container, which fights a normal DOM page, Lenis and SEO. One ScrollTrigger (`scrub: true`) writes `t` to a zustand store; DOM timelines and the R3F camera both read it. This is the architecture behind the 2026 FWA/CSSDA-winning Trionn site |
| Camera | **Code-defined CatmullRom splines + `camera-keys.json`** | Theatre.js | Theatre.js is excellent for hand-tuning but its docs have not moved since early 2024; JSON keys are versionable, diffable and Claude Code can iterate them. Add a dev-only Leva scrubber |
| Post | **@react-three/postprocessing**: Bloom (mipmapBlur, luminanceThreshold 0.85, intensity 0.55, radius 0.6), Vignette 0.35, Noise 0.03, SMAA, ChromaticAberration (velocity-driven, ≤ 0.002) | N8AO, SSR, DOF | No N8AO — Tripo bakes AO into the basecolor. No SSR — the reflector plane under the hero is enough. No DOF — fog does the depth work at a fraction of the cost |
| State | zustand (`t`, `velocity`, `chapter`, `quality tier`) | React state | Never `setState` per frame |
| Assets | glTF-Transform 4.x + KTX-Software `toktx`; Blender 4.x for masks/splits; Tripo Studio for optional segmentation | — | §9 |
| Video | H.264 + AV1 720p, muted, `playsinline`, lazy | — | Reels on the stage monitors |

Reference points from research (2026): scroll-driven 3D narratives out-score static 3D showcases on Awwwards; the winning pattern is one confident centrepiece per beat plus restraint, not stacked effects; production discipline = draw-call batching, Draco/meshopt + KTX2, mandatory disposal, reduced-motion, and warming up shaders/textures before a section becomes visible.

---

## 9. Asset pipeline (tested)

### 9.1 Tooling
```
npm i -D @gltf-transform/cli          # 4.4.2 used here
# KTX2: install KTX-Software (toktx) from github.com/KhronosGroup/KTX-Software/releases
pip install pygltflib numpy pillow    # for emissive.py
```

### 9.2 Per-model recipe (desktop tier)
```bash
M=sci-fi_control_table
gltf-transform simplify  $M.glb  $M.s.glb  --ratio 0.08 --error 0.0005   # ~150k tris, 4–13 s
gltf-transform resize    $M.s.glb $M.r.glb --width 2048 --height 2048
python emissive.py       $M.r.glb $M.e.glb 2.6                           # strength per §6
python strip.py          $M.e.glb $M.f.glb                               # drop normalTexture; RM → constants
gltf-transform uastc     $M.f.glb $M.k.glb --slots "{baseColor,emissive}" --level 2 --rdo 4
gltf-transform meshopt   $M.k.glb $M.web.glb --level high
```
Mobile tier: `--ratio 0.04`, textures 1024, emissive 1024, ETC1S instead of UASTC for emissive. Expect ~1 MB per model.

Expected desktop output: ~2.5–3 MB per model with KTX2 (larger on disk than WebP but 4–6× less VRAM and no decode stall).

### 9.3 `emissive.py` (derive an emissive map from the green panels)
Included alongside this document. Logic: load basecolor → mask = `(G − max(R,B) > 0.07) & (value > 0.22)` plus a soft 0.35 weight on near-white panels → Gaussian blur 1.2 px → emissive = basecolor × mask × tint `(0.62, 1.0, 0.70)` → append as a new image/texture → set `emissiveFactor [1,1,1]` and `KHR_materials_emissive_strength` = argv[3].

Calibrated strengths: table 2.6 · camera 1.3 · machine 0.9 · array 0.6 · booth 0.55 · stage 0.5 (mask the turntable disc).

### 9.4 `strip.py` (to write)
Remove `normalTexture`; set `metallicFactor 0.10`, `roughnessFactor 0.45`; remove `metallicRoughnessTexture` (keep a 1K copy only for the A/B); drop `KHR_materials_volume`; then `gltf-transform prune`.

### 9.5 Blender pass (one hour, three models)
- Stage: paint a black UV-region mask over the turntable disc in the emissive map.
- Table: optional separate the Cyphernaut (box-select x < −0.16 in model space, `P`).
- Array: optional separate the three rings if Tripo segmentation is not used.
Export GLB with "Apply Modifiers", no animation, +Y up.

---

## 10. Performance budgets and quality tiers

| Metric | Desktop (RTX-class / M-series) | Laptop iGPU | Mobile |
|---|---|---|---|
| DPR clamp | 1.5 | 1.25 | 1.0 |
| Model tier | desktop (≈150k tris, 2K KTX2) | desktop | mobile (≈75k, 1K) |
| Stations in frustum | ≤ 2 | ≤ 2 | ≤ 2 |
| On-screen triangles | < 400k | < 400k | < 200k |
| Draw calls | < 60 | < 60 | < 40 |
| Post | Bloom + Vignette + Noise + SMAA + CA | Bloom + Vignette + SMAA | Bloom + Vignette |
| Reflector | hero only, 384 px | off | off |
| Dust motes | 2,000 | 1,200 | 600 |
| Video monitors | 3 | 3 | 1 |
| VRAM | < 150 MB | < 120 MB | < 60 MB |
| Target fps | 60 | 50+ | 45+ |
| Hero interactive | < 2.5 s on 4G-fast | | < 3.5 s |
| Total transfer (no video) | < 30 MB | | < 12 MB |

Rendering policy: continuous `useFrame` while `|velocity| > 0.0005` or any idle animation is visible; otherwise render at 30 fps (hero) — scroll-scrub pages need frames while scrolling, but not 60 fps when parked. Warm up: compile shaders and upload textures for the next chapter's station during the current hold (`gl.compile` / `useGLTF.preload`).

Disposal: stations are never disposed while the page lives; the reflector render target is disposed after Chapter 0 exits.

---

## 11. Build order for Claude Code

1. **Scaffold**: Next.js + R3F + drei + postprocessing + GSAP + Lenis + zustand. Master `t` store; ScrollTrigger scrub; dev Leva scrubber; `?debug=1` helpers.
2. **Hero station**: optimized camera rig, procedural iris ring, aperture loader, bloom, floor + reflector, fog, dust. Ship this first — it is the whole first impression.
3. **World + splines**: place all six stations as boxes at §4 positions; implement `camera-keys.json`, holds, parallax; get the finale crane right before any other polish.
4. **Stations**: drop in the five remaining optimized GLBs; per-asset emissive strengths; idle motions; conduit shader with `u_progress`.
5. **DOM layer**: chapter blocks, chips, drawers, progress rail, cursor, counters; text reveal signatures.
6. **Stage media**: video monitors, lightbox, lazy loading.
7. **Tiers**: mobile variants, quality detection, reduced-motion, poster fallback, Lighthouse/WebPageTest pass; verify VRAM with `renderer.info`.
8. **Optional upstream**: Tripo segmentation/retopo → independent parts → ring/arm/head motions.

Definition of done per station: enters within 1 chapter of approach without a hitch, holds at 60 fps desktop with bloom, exits hidden, no console warnings, reduced-motion variant verified.

---

## 12. Open items

- **Reference page / design** not received. When it arrives, map its layout grid, type scale and nav onto §7; the 3D plan is independent of it.
- **Source images** not received. Only needed to grade Tripo fidelity and to decide whether any model deserves a Tripo re-run with a better input.
- **Portfolio reels** for the stage monitors: three 15–30 s loops, 16:9, 720p.
- **Counters** for Chapter 4: real numbers or clearly labelled illustrative figures (same rule as the tokenomics page).
- **Existing repo** `github.com/karankirtisharma/new-contentpage`: the no-build Three.js hero with 4 video screens and the post chain is superseded by this plan; the monitor-rig idea survives as the stage's floating monitors.

---

## 13. Deliverables in this package

| File | What |
|---|---|
| `content-page-3d-plan.md` | this document |
| `00_asset_audit_sheet.jpg` | all 10 models, four views each, with verdicts |
| `01_hero_looks_sheet.jpg` | the six chosen models with derived emissives, calibrated strengths, bloom and the dark floor |
| `hero_*.jpg` | individual hero looks |
| `web/*_web.glb` | six web-ready builds (8% tris, 2K WebP, meshopt) — dev-tier; run the KTX2 step for production |
| `emissive.py` | emissive-map derivation script (usage: `python emissive.py in.glb out.glb <strength>`) |
| `glb_report.json` | full per-file inspection dump (geometry, materials, texture sizes, node tree) |
