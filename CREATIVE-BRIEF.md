# CREATIVE BRIEF — AAA Cinematic Overhaul (condensed, as supplied by the owner)

Companion to `MASTER-OVERHAUL.md`. Where the two disagree, MASTER-OVERHAUL.md Part 0 rules.

Role: Creative Director + AAA Environment Artist + Cinematographer + Realtime Rendering
Engineer + Senior Three.js/R3F Engineer. Project: `D:\Claude\contentpageMD\site`.
Goal: transform the existing experience into a premium cinematic realtime sci-fi world
where scrolling feels like physically travelling through an environment. AAA game
environment cinematography × premium interactive web × restrained editorial design.

0. **MOST IMPORTANT RULE** — Do not start coding immediately. Audit everything, inspect all
   six GLBs (scale, orientation, focal point, emissives, silhouette, ideal angles),
   read the existing plan/BUILD-NOTES/camera/scroll/shaders/lighting/fog/post/tiers,
   research current techniques, form a plan BEFORE major changes. Make strong creative
   decisions without asking permission at each step.
1. **THE SIX GLBS ARE THE HERO ASSETS** — six pieces of one fictional alien industrial
   ecosystem, physically coexisting. Use the actual GLBs as source of truth; do not
   invent replacements. Weak angles are solved by camera + lighting, not pretending.
2. **FORGET THE CURRENT GREEN LOOK** — no generic cyberpunk, no neon green everywhere, no
   glowing floor, no outlines, no excessive bloom, no HUD overload, no procedural grid,
   no floating GLBs, no black-void-with-models. Green must come from actual light
   sources. Palette: near-black → charcoal → extremely dark green → muted forest
   green → localized emerald highlights. Large portions stay almost black.
3. **THE WORLD** — one continuous alien planetary environment. Foreground: dark rocky
   terrain, debris, subtle particles. Midground: formations, fog banks, silhouettes,
   machine structures. Background: enormous mountains, valleys, distant structures.
   Sky: almost black, subtle stars, extremely subtle nebula, huge green moon/planet —
   enormous but distant, participating in atmosphere (its light influences terrain,
   fog, machine edges), not a pasted wallpaper.
4. **NO MORE OBVIOUS SIGNAL LINE** — no neon tube / glowing road / laser / UI progress
   line. Hidden infrastructure instead: partially buried conduit, faint cables,
   underground channels, illuminated nodes, distant beacons, pulses through machinery,
   light in fog, reflections revealing presence. Discovered gradually; suggest, don't
   explain.
5. **THE EXPERIENCE** — scroll = physical forward travel. Not section→section: travel →
   discover → pass → disappear → continue → discover. One continuous geography.
6. **CAMERA DIRECTOR MINDSET** — spline trajectories, look-at splines, FOV choreography,
   local easing, velocity-aware smoothing, inertia, subtle drift, intermediate beats.
   Camera has mass; never floaty; no seasickness; no gratuitous shake.
7. **MOVE THROUGH SPACE, NOT BETWEEN OBJECTS** — machines are passed and fade into fog;
   terrain continues; new silhouettes emerge. Geographic continuity.
8. **CINEMATIC KEYFRAME SYSTEM** — data-driven timeline (progress, position, target, fov,
   optional roll/tension/easing/fogDensity/exposure/focusDistance); multiple meaningful
   beats per chapter; improve the architecture if research finds better.
9. **PROPOSED JOURNEY** (foundation, not hard requirement) — 11 beats: establish (wide,
   moon, scale, slow) → begin travel → enter atmosphere (volumetric region, not flat
   overlay) → visibility collapses → first discovery (silhouette + small lights) →
   reveal (fog separates, practicals illuminate) → hero approach (perspective, not
   zoom; foreground elements near lens) → hero pass (arc, off-center composition,
   negative space for type) → departure (light shrinks, fog hides) → atmospheric
   transition (darkness, environment performs the transition) → next discovery
   (different composition/height/lens/direction/timing — never reuse a reveal).
10. **EVERY MACHINE ITS OWN CINEMATIC LANGUAGE** — rig: wide establish/side approach/
    subtle orbit. Table: lower, closer, operator-scale, surface emphasis. Stage:
    frontal symmetric slow push-in, vertical emphasis. Booth: pass through/beside,
    foreground occlusion, tighter lens. Machine: lateral movement, machinery detail,
    deeper shadows. Array: larger environment, distant composition, pull-away.
11. **FOG — THE MOST IMPORTANT EFFECT** — research depth/height/procedural noise/layered
    volumes/raymarched/froxel-like/particles/scattering/god rays; choose the best
    illusion per cost.
12. **FOG MUST HAVE VOLUME** — camera travels a corridor between atmospheric volumes;
    side fog thickens, distant objects silhouette, light scatters.
13. **FOG REVEALS CORRECTLY** — nothing → tiny distant light → silhouette → green rim →
    partial geometry → medium detail → full machine → material detail. Never fog →
    sudden GLB.
14. **LIGHTING AAA** — moon (huge distant green source, subtle: edge illumination,
    atmospheric contribution, terrain shaping — not a floodlight), machine practicals
    (small localized emissives affecting nearby geometry), signal (subtle local),
    environment (very weak ambient; large parts stay dark).
15. **LIGHTING CONTRAST** — BLACK → SHADOW → DARK GREEN → MUTED GREEN → EMERALD
    HIGHLIGHT. Falloff on everything; fog catches light.
16. **RENDERING QUALITY** — research PBR, tone mapping, color management, contact shadows,
    SSAO/GTAO, selective bloom, reflections, SSR-where-appropriate, depth effects,
    cinematic DOF, temporal effects. Every effect must justify itself.
17. **REFLECTIONS** — machines must not be dead black plastic. Env maps, dynamic cubemaps
    where justified, SSR/planar for selected surfaces, probes/baked, hybrid. Choose
    intelligently; a few hero surfaces get higher treatment.
18. **AO/CONTACT** — critical grounding. GTAO/SSAO/contact shadows/baked AO/shader
    approximation. No floating GLBs; bases visually connect to terrain.
19. **TERRAIN** — no generic infinite plane. Procedural where appropriate, displaced
    geometry, rocky meshes, instanced rocks, varying scale, height variation, layers.
    Intelligent LOD/instancing; no millions of wasted triangles.
20. **ENVIRONMENTAL PARALLAX** — fg fast, mid moderate, bg slow, mountains very slow,
    moon extremely slow, fog independent.
21. **PARTICLES** — extremely restrained: dust, atmosphere, tiny debris, distant motes.
22. **THE MOON** — enormous, distant, green, partially obscured by atmosphere, physically
    integrated; crater/detail texture, subtle terminator, atmospheric rim, haze
    interaction; sometimes partially hidden; not perfectly crisp throughout.
23. **SKY** — predominantly black; sparse subtle varied stars, depth-aware if possible;
    no starfield wallpaper; no colorful galaxy; very subtle nebula acceptable.
24. **WORLD ANIMATION** — environment breathes slowly: fog drift, cloud movement,
    particle drift, machine light breathing, signal propagation, occasional distant
    beacons. Terrain static, machines mostly static. Alive without being a demo.
25. **SIGNAL BEHAVIOR** — network of cables/conduits/nodes/buried channels/beacons/
    machine connections; subtle energy pulse synchronized with journey progress.
26. **FINAL PAYOFF** — scale change: pull back + rise; fog separates; machines revealed
    as one enormous system; progressive activation machine 1..6 pulse by pulse; then
    the network subtly alive. This is the climax.
27. **UI** — editorial layer over film: restrained typography, small labels, chapter
    indicators, sparse navigation, contextual descriptions, careful CTA. No cards
    everywhere, no giant HUD, no glassmorphism, no neon borders, no dashboards. 3D is
    the interface; typography occupies intentional negative space.
28. **COMPOSITION FOR TEXT** — machine right/text left, then machine left/text right,
    then centered/minimal, then full-screen no text. Type like film titles, never
    permanently overlaid on machines.
29. **POST** — restraint: appropriate tone mapping, color management, selective bloom,
    AO/contact, subtle vignette, very subtle grain, chromatic only if justified,
    atmospheric scattering, DOF only at cinematic moments. Bloom reveals light, does
    not create it.
30. **PERFORMANCE** — real website: adaptive DPR, capability detection, LOD, instancing,
    frustum culling, efficient loading, compressed textures, lazy assets, shader
    optimization, post tiers, reduced motion, mobile fallback, WebGL fallback.
31. **EXISTING ARCHITECTURE** — audit before replacing; reuse Lenis/GSAP/ScrollTrigger/
    non-reactive state/spline camera/tiers/uniforms/loaders when sound. No React state
    per frame.
32. **PIPELINE** — scroll → Lenis → normalized progress → cinematic timeline → camera
    spline → position/target/FOV/roll → environment state (fog, lighting, signal,
    particles, post) → render. Scroll is a control input, not the animation.
33. **CINEMATIC EASING** — no linear/constant/hard stops/snapping/sudden direction
    changes; smooth accel/decel, piecewise easing, inertia, velocity-aware, subtle
    overshoot only where appropriate. Camera has weight.
34. **FOV** — part of cinematography: wide establish, normal approach, tighter fog,
    slightly wider reveal, tighter close detail, wide final crane. Never obvious.
35. **RESEARCH REQUIREMENT** — research AAA three.js environments, cinematic WebGL, R3F
    perf, volumetric/procedural fog, scattering, volumetric lighting, camera splines,
    realtime reflections, GTAO/SSAO, contact shadows, terrain, instancing, post,
    optimization. Prefer official docs/technical articles/quality open source. Evaluate
    visual gain vs GPU cost vs compatibility.
36. **BEFORE CODING: VISUAL BLUEPRINT** — world (terrain/fog/moon/sky/depth), six assets
    (location/orientation/scale/camera/lighting), camera beats, fog map, lighting,
    post, performance tiers. Then implement.
37. **IMPLEMENTATION ORDER** — 16 phases: audit → research → composition → terrain/env →
    atmosphere → camera timeline → place GLBs → unique reveals → lighting → hidden
    signal → post → UI integration → final crane → optimize → full journey test →
    polish repeatedly.
38. **DO NOT ACCEPT "FUNCTIONAL"** — repeated passes asking: camera mass/motivation,
    world enormity, fg/mid/bg readability, fog occupying space, light from sources,
    machines grounded/massive/belonging, travel not sections, signal mysterious,
    crane-out genuinely revealing.
39. **ABSOLUTE CREATIVE RULE** — any paused frame with text/UI removed must look like a
    frame from a high-budget sci-fi game cinematic. That is the quality bar.
40. **FINAL DELIVERABLE** — actually modify the site; `npm run build` + typecheck + lint
    clean; review the full scroll journey; update BUILD-NOTES.md with world
    architecture, GLB placement, camera architecture, keyframes, fog, lighting,
    reflections, AO, signal, post, performance, tiers, deviations.

**FINAL INSTRUCTION** — think like a game cinematographer first, web developer second.
One world. One journey. One cinematic experience. The viewer scrolls; the camera
travels; the fog hides; the environment reveals; the machines feel discovered; the
Signal quietly guides; at the end the entire system is revealed. Make it feel expensive.
