/* =====================================================================
   HERO SCENE — energy-machine rig hung from a ceiling, video screens,
   intro dolly. The machine and its four screens are one body (`rigBody`)
   inside one spinning group (`rig`); scroll turns it on Y and nothing else.
   Camera constants and the intro timing are transcribed from the reference
   mirror; the accent hue follows HERO_SPEC §2. See DECISIONS.md.
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const ASSETS = window.HERO_ASSETS || {};
const FINAL = ASSETS.finalDir || 'assets-final/';
const PLACE = ASSETS.placeholderDir || 'placeholders/';

/* PALETTE — neutral.
   The scene used to tint everything green: lights, fog, backdrop, ceiling, the
   env map and the screen grade all carried the §2 accent. The result was a
   colour filter over the viewport rather than a lit object — one hue at one
   value, and highlights that came back saturated green so the glass never read
   as glass. Green now comes from exactly one place: the model's own basecolor.
   Everything that lights it or sits behind it is neutral, so a specular
   highlight returns white and the material can show its own colour. */
const NEUTRAL_HI  = 0x1a1c1e;     /* background gradient, light end */
const NEUTRAL_LO  = 0x0a0b0c;     /* background gradient, dark end  */

/* --------------------------------------------------- RIG NORMALISATION
   Tunables for fitting assets-final/hero-rig.glb into the scene. The model is
   centred on its bounding box and scaled uniformly so its diagonal matches
   RIG_TARGET_DIAG; RIG_Y_STRETCH is deliberately 1.0 — the 1.2 that used to
   live here was tuned for the procedural box mast and visibly distorts a real
   asset. */
const RIG_TARGET_DIAG = 3.6;    /* world-space diagonal the model is scaled to */
const RIG_Y_STRETCH   = 1.0;    /* was 1.2 — a box-rig hack, never for a real asset */
const CEILING_Y       = 0.62;   /* mount plane: the model's bbox top lands exactly here */
/* The ceiling is a spherical cap. Its radius is deliberately huge: the machine's
   canopy is a FLAT disc reaching r 1.651, so a tight dome curves out from under
   it and the disc punches straight through — at R 7 it pierced by 0.197. Drop
   over a radius r is ~r^2/2R, so R 70 puts that at 0.019, invisible, while the
   cap still curves visibly away at the frame edges (0.26 at r 6, 0.73 at the
   rim) which is the whole reason it is not a flat plane. */
const CEILING_R       = 70.0;   /* dome radius — flat where the rig mounts, curved at the edges */
const CEILING_ARC     = 0.145;  /* radians of cap; rim lands at r ~10.1 */
const FOG_DENSITY     = 0.055;  /* FogExp2; depth separation without hiding the rig */
/* height of the dome surface at a given horizontal radius */
const domeYatRadius = r => CEILING_Y - CEILING_R + Math.sqrt(Math.max(0, CEILING_R * CEILING_R - r * r));
/* The orbit target is lifted to the machine's own centre and the camera is set
   a little BELOW it, so the shot looks slightly upward and the ceiling is seen
   from underneath — the only way the mount reads as a mount. Both are derived
   from the model at load (ORBIT_Y), not guessed. The orbit itself is unchanged:
   same radius, same spin, same polar clamp — only where it is centred moved. */
const ORBIT_RISE      = -0.10;  /* camera height relative to the orbit target */
const ORBIT_XZ        = [-2.686, -2.199];  /* keeps the original 3.471 orbit radius */
const SCROLL_SPIN     = 0.0016; /* radians of rig.rotation.y per scrolled design-px */

let ORBIT_Y = 0;                /* machine centre in world Y; set when the rig loads */
let CANOPY_R = 1.651;           /* canopy rim radius; re-measured when the rig loads */
let ceilingMat = null;          /* so the loader can hand the real radius to the shader */

/* dev-only placement mode, ?tune=1 — see TUNE MODE at the foot of this file */
const TUNE = new URLSearchParams(location.search).get('tune') === '1';

const container = document.getElementById('scene3d');
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(28.5, container.clientWidth / container.clientHeight, 0.1, 100);
/* Provisional only — the real pose is set from ORBIT_Y once the rig loads, and
   nothing renders before then. */
camera.position.set(-2.686, 0.52, -2.199);
camera.lookAt(0, 0.62, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.setClearColor(0x000000, 0);
/* Resolution. This used to be hard-capped at 1.0, which is what made the whole
   hero look soft — but device pixel ratio alone is not the whole story here.
   #scene3d is 1024 CSS px wide inside a #page that chrome.js scales by
   viewportWidth/1024, so container.clientWidth always reports 1024 while the
   canvas is *displayed* 1.4x larger than that on a 1440 viewport. Rendering at
   devicePixelRatio would still leave a 1024-wide buffer stretched over 1440
   pixels. The backing store has to cover design scale AND device ratio.
   Capped at 2 so a hidpi phone does not quadruple the fill cost for nothing. */
const HERO_DPR_CAP = 2;
function heroPixelRatio() {
  const pageScale = window.__SCALE || 1;          /* set by chrome.js rescale() */
  return Math.min((window.devicePixelRatio || 1) * pageScale, HERO_DPR_CAP);
}
renderer.setPixelRatio(heroPixelRatio());
renderer.setSize(container.clientWidth, container.clientHeight);
/* The rig is the first textured PBR asset in this scene, so the output chain
   finally has to be right: sRGB out, ACES filmic in. Tone mapping applies to
   lit materials only — the accent lines and the screen planes opt out below,
   so the §2 palette lands exactly where it did before. */
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;   /* raised back from 0.78: neutral lights deliver far less than green ones did */
container.appendChild(renderer.domElement);

/* ---------------------------------------------------------------- LIGHTS
   Rebuilt for contrast. The old rig was a 40-intensity spot plus a rim AND a
   fill, which lit every surface to roughly the same value — that flat, blown,
   single-note look. The rule now is: one motivated key, one rim, almost no
   ambient, and most of the frame left in shadow.

   Values changed:  ambient  0.30 -> 0.05 and re-hued to teal, so shadows fall
                             toward blue-green instead of matching the accent
                    spot     40 -> 26 but MOVED to 1.3 above the ceiling and
                             narrowed (angle 0.62, penumbra 0.30 -> 0.82), so it
                             lights the machine like the fixture it hangs from
                             instead of washing it from the side
                    fill     0.80 -> 0.10 (all but killed — it was the main
                             cause of the even, formless lighting)
                    rim      1.20 -> 1.25, and now WHITE — a green rim on a
                             green model just deepened the single-hue problem  */
/* White lights, not green ones. A green key on a green material multiplies to
   a flat saturated green with no specular life; a white key lets the basecolor
   supply the hue and the highlight come back near-white, which is the whole
   difference between "tinted" and "wet glass". */
const SHADOW_TONE = 0x2a2e33;     /* neutral, very slightly cool */
const KEY_TINT    = 0xfff6ec;     /* white, a hair warm          */
const RIM_TONE    = 0xdfe9ff;     /* white, a hair cool          */
const FILL_TONE   = 0xffffff;

scene.add(new THREE.AmbientLight(SHADOW_TONE, 0.42));

/* motivated key: it lives AT the mount and points down the machine */
/* Sits ABOVE the ceiling, not at the mount. With decay 2 a spot placed level
   with the canopy is effectively inside the geometry, and 1/r^2 turns the mount
   into a white blob. Backing it off 1.3 above the ceiling and raising the
   intensity to match gives the same pool with a usable falloff. */
const spotLight = new THREE.SpotLight(KEY_TINT, 26);
spotLight.position.set(0, CEILING_Y + 1.3, 0);
spotLight.target.position.set(0, CEILING_Y - 2.4, 0);
spotLight.angle = 0.62;
spotLight.penumbra = 0.82;        /* soft-edged pool, not a hard cone */
spotLight.decay = 2;
spotLight.distance = 11;
scene.add(spotLight, spotLight.target);

/* rim, opposite the idle camera, to lift the silhouette off the haze */
const rimLight = new THREE.DirectionalLight(RIM_TONE, 1.25);
rimLight.position.set(2.6, 1.3, 2.2);
scene.add(rimLight);

/* what is left of the fill — just enough that the shadow side is not a hole */
const fillLight = new THREE.DirectionalLight(FILL_TONE, 0.32);
fillLight.position.set(-2.2, 0.4, 1.8);
scene.add(fillLight);

/* ------------------------------------------------------- ATMOSPHERE
   Fog gives the rig depth — the far arms sink back instead of reading as one
   flat cutout. But fog only tints geometry, never empty space, so on a black
   background it would do nothing to the frame. The backdrop shell is what the
   fog colour actually lands on: a big inside-out sphere carrying a vertical
   gradient broken up by fbm noise, so the emptiness behind the machine has
   some drift in it rather than being a flat black card.
   ShaderMaterial ignores scene.fog by default, which is what we want here —
   the backdrop *is* the haze, it should not be fogged on top of itself. */
const NOISE_GLSL = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1,0)), u.x),
               mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.02; a *= 0.5; }
    return v;
  }`;

scene.fog = new THREE.FogExp2(0x0e1013, FOG_DENSITY);   /* neutral grey, no hue */
{
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(22, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uDeep: { value: new THREE.Color(NEUTRAL_LO) },
                  uHaze: { value: new THREE.Color(NEUTRAL_HI) } },
      vertexShader: `varying vec3 vP;
        void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uDeep; uniform vec3 uHaze; varying vec3 vP;
        ${NOISE_GLSL}
        void main(){
          float band = smoothstep(-0.85, 0.85, vP.y);            /* haze gathers upward */
          float drift = fbm(vec2(atan(vP.z, vP.x) * 1.6, vP.y * 2.4) * 2.2);
          /* a soft bloom of light behind the machine, so it sits IN the haze
             rather than in front of a flat wall of it */
          float core = pow(1.0 - clamp(abs(vP.y) * 1.35, 0.0, 1.0), 2.0);
          /* biased so the upper-centre actually reaches uHaze — the gradient has
             to be visible as a gradient, not collapse to the dark end */
          float a = band * (0.55 + 0.45 * drift) + core * 0.55 * (0.5 + 0.5 * drift);
          gl_FragColor = vec4(mix(uDeep, uHaze, clamp(a, 0.0, 1.0)), 1.0);
        }`
    })
  );
  backdrop.renderOrder = -2;
  scene.add(backdrop);
}

/* -------------------------------------------------------- ENVIRONMENT
   This is the single most important light in the scene and it is not a light.
   The rig samples at metalness 0.88 / roughness 0.07 — a near-mirror. A metal
   that smooth reflects its surroundings and almost nothing else, so with no
   environment it renders as a black silhouette at ANY light intensity; the
   spot and rim only ever give it a few specular pinpricks.

   The env is generated at runtime with PMREMGenerator from the same palette
   and the same vertical gradient as the backdrop shell above, so what the
   metal reflects and what sits behind it agree instead of looking pasted
   together. Plus a mint key card at the mount, matching the spot, so the
   reflections have a bright edge to run along rather than a flat wash.
   No asset, no extra dependency.

   ENV_INTENSITY is the exposure knob for the machine — reach for it before the
   lights, since it is what the surface is actually made of. It went 15 -> 2.5:
   the canopy is a wide, nearly flat mirror seen at a grazing angle, so it was
   sampling the env's bright upper hemisphere across its whole face and blowing
   out to a flat green disc. At 2.5 it reads as dark metal with a hot rim, which
   is what gives the top of the frame any form at all. */
const ENV_INTENSITY = 3.4;
{
  const envScene = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      /* Deliberately far brighter than the visible backdrop. This shell is never
         drawn — it only feeds PMREM. A near-mirror reflects the environment and
         almost nothing else, so if the env matches the dim background the metal
         has nothing to return and goes black. A studio softbox is much brighter
         than the wall behind the subject; same idea. */
      uniforms: { uDeep: { value: new THREE.Color(0x24282c) },
                  uHaze: { value: new THREE.Color(0xc2ccd4) },
                  uCool: { value: new THREE.Color(0x4a5158) } },
      vertexShader: `varying vec3 vP;
        void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uDeep; uniform vec3 uHaze; uniform vec3 uCool; varying vec3 vP;
        void main(){
          /* same vertical structure as the backdrop. Neutral throughout: this
             is what the metal reflects, so any hue here would come straight
             back as a tinted highlight and kill the glass read. */
          float up = smoothstep(-0.85, 0.85, vP.y);
          vec3 c = mix(mix(uCool, uDeep, smoothstep(-1.0, -0.1, vP.y)), uHaze * 0.62, up);
          gl_FragColor = vec4(c, 1.0);
        }`
    })
  );
  envScene.add(shell);
  /* key card at the mount, matching the spot — gives the mirror an edge to catch */
  const key = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ color: KEY_TINT }));
  key.position.set(0, CEILING_Y + 0.4, 0);
  key.rotation.x = Math.PI / 2;
  envScene.add(key);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.035).texture;
  pmrem.dispose();
  shell.geometry.dispose(); shell.material.dispose();
  key.geometry.dispose(); key.material.dispose();
}

/* ------------------------------------------------------------- CEILING
   The rig hangs from this like a ceiling fan: the model's bbox top is placed
   exactly at CEILING_Y, and the plane sits in world space (not under `rig`),
   so the machine spins beneath a mount that stays put. Lit only by ambient and
   the environment — the spot is above it — which is what makes it read as a
   dark slab the machine is bolted to rather than another glowing surface. */
{
  /* Shaded by hand rather than lit: every light sits above this surface, so a
     lit material would leave the underside pure black and the mount would read
     as nothing. Instead the ceiling is drawn: a dark slab, an accent pool where
     the fixture spills light onto it, a rim halo at the disc's edge, and fbm
     mottling so it reads as a real surface rather than a gradient.

     It is a shallow spherical cap, not a flat plane. Seen from underneath a
     flat plane collapses to a hard straight edge across the frame; a dome
     curves away at the sides and reads as something the room actually has. The
     cap's pole sits exactly at CEILING_Y, which is where the model's bbox top
     is placed, so the shaft meets it flush. */
  const ceiling = new THREE.Mesh(
    new THREE.SphereGeometry(CEILING_R, 64, 24, 0, Math.PI * 2, 0, CEILING_ARC),
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
      uniforms: { uCol: { value: new THREE.Color(0xd8e2ea) },
                  uBase: { value: new THREE.Color(0x121417) },
                  uCanopyR: { value: CANOPY_R } },
      vertexShader: `varying float vR; varying vec3 vL;
        void main(){
          vL = position;
          vR = length(position.xz);        /* world radius from the mount */
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `uniform vec3 uCol; uniform vec3 uBase; uniform float uCanopyR;
        varying float vR; varying vec3 vL;
        ${NOISE_GLSL}
        void main(){
          /* Everything here is in WORLD radius. It used to be normalised against
             the cap's arc, which meant flattening the dome silently scaled the
             light pool up with it and blew the whole ceiling out. */
          float pool = 1.0 - smoothstep(uCanopyR * 0.35, uCanopyR * 2.1, vR);
          float halo = 1.0 - smoothstep(0.0, uCanopyR * 0.16, abs(vR - uCanopyR));
          float slab = 1.0 - smoothstep(uCanopyR * 1.6, uCanopyR * 5.5, vR);
          float grain = 0.6 + 0.4 * fbm(vec2(atan(vL.z, vL.x) * 3.0, vR * 1.1) * 2.6);
          vec3 col = uBase + uCol * (0.10 * pool + 0.13 * halo) * grain;
          gl_FragColor = vec4(col, clamp(slab * 0.55 + pool * 0.30 + halo * 0.45, 0.0, 1.0));
        }`
    })
  );
  /* sphere centre dropped by the radius so the cap's pole lands on CEILING_Y */
  ceilingMat = ceiling.material;
  ceiling.position.y = CEILING_Y - CEILING_R;
  ceiling.renderOrder = -1;
  scene.add(ceiling);
}

/* --------------------------------------------------------- LIGHT SHAFT
   A cone of light falling from the mount down the machine. Additive, no depth
   write, and deliberately faint — the moment it reads as a solid cone it has
   gone too far. It is what stops the key light from being invisible: without
   something in the air to catch it, a spot in a dark room only shows where it
   lands, never that it travelled. */
const SHAFT_OPACITY = 0.007;   /* cut hard: against a neutral background the cone started reading as a wedge */
{
  const shaft = new THREE.Mesh(
    new THREE.ConeGeometry(1.75, 2.9, 48, 1, true),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uCol: { value: new THREE.Color(0xffffff) }, uOp: { value: SHAFT_OPACITY } },
      vertexShader: `varying vec2 vUv; varying vec3 vN;
        void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uOp; varying vec2 vUv; varying vec3 vN;
        void main(){
          /* fade in from the mount and out well before the cone's own bottom
             edge, so there is never a hard rim to read as a fog card */
          float down = smoothstep(0.0, 0.30, vUv.y) * (1.0 - smoothstep(0.35, 0.92, vUv.y));
          /* grazing angles read brightest, like a real shaft edge-on; a high
             exponent keeps the middle of the cone empty */
          float graze = pow(1.0 - abs(vN.z), 3.6);
          gl_FragColor = vec4(uCol, uOp * down * graze);
        }`
    })
  );
  shaft.position.y = CEILING_Y - 1.45;
  shaft.renderOrder = 3;
  scene.add(shaft);
}

/* ----------------------------------------------------------------- RIG
   One body. `rig` sits on the orbit target's X/Z axis and only ever spins on Y;
   `rigBody` holds the model AND the four screens with the model's bounding-box
   centre at its local origin, so every screen constant below is expressed
   relative to the model itself and can never drift away from it. The mirror's
   ~68px camera-right nudge is gone — it threw the machine off the axis it now
   has to rotate about. */
const rig = new THREE.Group();
const rigBody = new THREE.Group();
rig.add(rigBody);
scene.add(rig);

/* The §2 tier ramp. Shared: the screen grade is now its only caller, which is
   correct — it was always defined once and used by both the grade and the
   night-vision pass, and only the latter is gone.
   black -> #02160b -> #0a3d1f -> #148f43 -> #19e65a -> #8affb0 -> #eafff2 */
const GREEN_RAMP = `
  vec3 greenRamp(float l){
    vec3 g = vec3(0.0);
    g = mix(g, vec3(0.008,0.086,0.043), smoothstep(0.02,0.14,l));
    g = mix(g, vec3(0.039,0.239,0.122), smoothstep(0.14,0.30,l));
    g = mix(g, vec3(0.078,0.561,0.263), smoothstep(0.30,0.50,l));
    g = mix(g, vec3(0.098,0.902,0.353), smoothstep(0.50,0.70,l));
    g = mix(g, vec3(0.541,1.000,0.690), smoothstep(0.70,0.86,l));
    g = mix(g, vec3(0.918,1.000,0.949), smoothstep(0.86,0.98,l));
    return g;
  }`;

/* ------------------------------------------------------- VIDEO SCREENS */
/* Screen footage is graded onto the §2 tiers so arbitrary stock clips still
   leave green as the only hue in the viewport. Set HERO_ASSETS.screenGrade
   to 0 for raw footage colour. */
/* SCREEN_GAIN is what stops the panels leading the frame. They were rendering
   at full value and dominating everything; they are panels in a dark room, not
   light sources. The ramp drive is pulled down too (1.15 -> 0.62) so mid
   luminance lands in the ramp's dark tiers instead of at the top — that top-end
   landing was what crushed every clip to the same flat bright green. */
const SCREEN_GAIN = { value: 0.26 };
const uGrade = { value: ASSETS.screenGrade ?? 1 };
function screenMaterial(tex) {
  /* fog:false — hazing the panels would eat the contrast that keeps their
     content legible at this brightness */
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false, fog: false });
  m.onBeforeCompile = shader => {
    shader.uniforms.uGrade = uGrade;
    shader.uniforms.uGain = SCREEN_GAIN;
    shader.fragmentShader = `uniform float uGrade; uniform float uGain;\n${GREEN_RAMP}\n` + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       {
         float l = pow(clamp(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722)), 0.0, 1.0), 1.0 / 2.2);
         vec3 graded = pow(greenRamp(clamp(l * 0.62, 0.0, 1.0)), vec3(2.2));
         diffuseColor.rgb = mix(diffuseColor.rgb, graded, uGrade) * uGain;
       }`
    );
  };
  return m;
}

function makeVideo(i, flip) {
  const name = NAMES[i];
  /* stock URL -> local procedural loop. HERO_ASSETS.finalScreens puts an
     assets-final/ probe in front when real finals land. */
  const sources = [ASSETS.finalScreens ? FINAL + name : null, STOCK[i], PLACE + name].filter(Boolean);
  let step = 0;

  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';   /* required — a video without CORS throws on texture upload */
  v.preload = 'auto';
  v.loop = true; v.muted = true; v.playsInline = true; v.autoplay = true;
  v.setAttribute('webkit-playsinline', ''); v.setAttribute('playsinline', '');
  v.addEventListener('error', () => {
    if (step < sources.length - 1) v.src = sources[++step];
    try { v.load(); } catch (e) {}
    safePlay();
  });
  v.addEventListener('stalled', () => safePlay());
  v.src = sources[step];

  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (flip) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; }
  return { v, tex, mesh: null, centre: new THREE.Vector3(), normal: new THREE.Vector3() };
}
const NAMES = ASSETS.screens || ['screen-a.mp4', 'screen-b.mp4', 'screen-c.mp4', 'screen-d.mp4'];
const STOCK = ASSETS.stock || [];

/* Video elements exist immediately — the preloader races on s3's readyState —
   but the meshes do not; they come out of the GLB. See extractScreenFaces. */
const screens = [makeVideo(0), makeVideo(1), makeVideo(2), makeVideo(3, true)];
const s3 = screens[2];   /* face square to the idle camera; the intro dollies out from it */
function safePlay() { screens.forEach(s => s.v.play().catch(() => {})); }

/* ------------------------------------------------ SCREEN FACE EXTRACTION
   No PlaneGeometry overlays, no hardcoded transforms.

   The GLB is one fused mesh — a single node, a single material, zero draw
   groups — so there is no screen sub-mesh whose material could simply be
   swapped, and its UVs are a single atlas spanning the whole model (u and v
   both 0..1 over everything), so they cannot carry a video either. What the
   mesh does have is the four display faces themselves, as real triangles.

   So pull those triangles out and build the screen geometry from their actual
   vertex positions. Because the result *is* the face, the video cannot sit
   crooked and cannot spill past the bezel — there is no separate quad left to
   misalign. UVs are a planar projection onto the face's own basis.

   Selection, per XZ-diagonal quadrant: a triangle qualifies when its centroid
   lies in that quadrant beyond FACE_MIN_RADIUS, its geometric normal points
   outward along the diagonal, and its depth along that diagonal falls in the
   modal slab. Measured on this asset: all four faces peak at ~0.70 in mesh-
   local units with the bulk inside +-0.03 — one flat plane, no recessed bezel.

   All of this is in the GLB mesh's own local space, and the result is added as
   its child, so the two share a transform exactly and can never drift apart. */
const FACE_NORMAL_MIN = 0.88;   /* dot(faceNormal, outwardDiagonal) */
const FACE_MIN_RADIUS = 0.45;   /* mesh-local; excludes the hub and inner arms */
const FACE_SLAB       = 0.032;  /* mesh-local half-thickness of the modal plane */
const FACE_TRIM       = 0.01;   /* drop this fraction of outliers off each in-plane edge */
const VIDEO_ASPECT    = 16 / 9;
/* order fixes which clip lands on which face; index 2 (X-Z-) is the intro anchor */
const QUADRANTS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];

function extractScreenFaces(mesh) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
  const triCount = (idx ? idx.count : pos.count) / 3;
  const vi = i => (idx ? idx.getX(i) : i);
  const buckets = QUADRANTS.map(() => []);

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const i0 = vi(t * 3), i1 = vi(t * 3 + 1), i2 = vi(t * 3 + 2);
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const gx = (a.x + b.x + c.x) / 3, gz = (a.z + b.z + c.z) / 3;
    if (Math.hypot(gx, gz) < FACE_MIN_RADIUS) continue;
    const q = QUADRANTS.findIndex(([sx, sz]) => Math.sign(gx) === sx && Math.sign(gz) === sz);
    if (q < 0) continue;
    const ox = QUADRANTS[q][0] / Math.SQRT2, oz = QUADRANTS[q][1] / Math.SQRT2;
    e1.subVectors(b, a); e2.subVectors(c, a); nrm.crossVectors(e1, e2).normalize();
    if (nrm.x * ox + nrm.z * oz < FACE_NORMAL_MIN) continue;
    buckets[q].push([i0, i1, i2, gx * ox + gz * oz, nrm.x, nrm.y, nrm.z]);
  }

  return buckets.map(tris => {
    if (!tris.length) return null;
    /* modal depth = the display plane, as opposed to the arm and the outer rim */
    const depths = tris.map(t => t[3]).sort((x, y) => x - y);
    const lo = depths[0], hi = depths[depths.length - 1], BINS = 40;
    const h = (hi - lo) / BINS || 1, hist = new Array(BINS).fill(0);
    depths.forEach(d => hist[Math.min(BINS - 1, Math.floor((d - lo) / h))]++);
    let best = 0; for (let i = 1; i < BINS; i++) if (hist[i] > hist[best]) best = i;
    const plane = lo + (best + 0.5) * h;
    const face = tris.filter(t => Math.abs(t[3] - plane) <= FACE_SLAB);
    if (face.length < 8) return null;

    /* average normal, then an in-plane basis: v is up flattened onto the plane,
       u completes the right-handed pair */
    const n = new THREE.Vector3();
    face.forEach(t => n.add(new THREE.Vector3(t[4], t[5], t[6])));
    n.normalize();
    const v = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    const u = new THREE.Vector3().crossVectors(v, n).normalize();

    /* Trim in-plane outliers before anything else. A handful of stray triangles
       at the same depth but off to one side would otherwise do real damage:
       they stretch the (u,v) extent the UVs normalise against, which shifts and
       shrinks the video across the whole panel. Percentile bounds, not min/max. */
    const tmp = new THREE.Vector3();
    const cu = [], cv = [];
    for (const t of face) {
      tmp.set(0, 0, 0);
      for (const i of [t[0], t[1], t[2]]) {
        const q = new THREE.Vector3().fromBufferAttribute(pos, i);
        tmp.add(q);
      }
      tmp.multiplyScalar(1 / 3);
      t[7] = tmp.dot(u); t[8] = tmp.dot(v);
      cu.push(t[7]); cv.push(t[8]);
    }
    const pct = (arr, f) => { const a = arr.slice().sort((x, y) => x - y);
      return a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))]; };
    const uLo = pct(cu, FACE_TRIM), uHi = pct(cu, 1 - FACE_TRIM);
    const vLo = pct(cv, FACE_TRIM), vHi = pct(cv, 1 - FACE_TRIM);
    const padU = (uHi - uLo) * 0.06, padV = (vHi - vLo) * 0.06;
    const kept = face.filter(t => t[7] >= uLo - padU && t[7] <= uHi + padU
                               && t[8] >= vLo - padV && t[8] <= vHi + padV);
    if (kept.length < 8) return null;

    const P = new Float32Array(kept.length * 9);
    let k = 0, u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const t of kept) {
      for (const i of [t[0], t[1], t[2]]) {
        tmp.fromBufferAttribute(pos, i);
        P[k++] = tmp.x; P[k++] = tmp.y; P[k++] = tmp.z;
        const du = tmp.dot(u), dv = tmp.dot(v);
        if (du < u0) u0 = du; if (du > u1) u1 = du;
        if (dv < v0) v0 = dv; if (dv > v1) v1 = dv;
      }
    }
    const w = u1 - u0, hgt = v1 - v0;
    /* cover-fit rather than stretch: the face is ~1.24:1 and the footage is
       16:9, so filling it by stretching would smear the code text sideways.
       Crop the overflow instead. */
    const faceAspect = w / hgt;
    const sx = faceAspect < VIDEO_ASPECT ? faceAspect / VIDEO_ASPECT : 1;
    const sy = faceAspect < VIDEO_ASPECT ? 1 : VIDEO_ASPECT / faceAspect;

    const UV = new Float32Array(kept.length * 6);
    for (let i = 0, j = 0; i < P.length; i += 3) {
      tmp.set(P[i], P[i + 1], P[i + 2]);
      UV[j++] = 0.5 + ((tmp.dot(u) - u0) / w - 0.5) * sx;
      UV[j++] = 0.5 + ((tmp.dot(v) - v0) / hgt - 0.5) * sy;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    g.computeBoundingSphere();
    return { geometry: g, normal: n, centre: g.boundingSphere.center.clone(),
             tris: kept.length, dropped: face.length - kept.length, size: [w, hgt] };
  });
}

/* ------------------------------------------------------------- THE RIG */
/* The face normal comes from the extracted geometry itself, so this is just a
   local->world direction transform. Same rule as before, same resulting pose. */
function outwardNormal(entry) {
  const n = entry.normal.clone().transformDirection(entry.mesh.matrixWorld).normalize();
  if (n.dot(entry.mesh.localToWorld(entry.centre.clone())) < 0) n.negate();
  return n;
}

let modelReady;
const modelP = new Promise(res => { modelReady = res; });
function mountRig(obj) {
  if (obj) rigBody.add(obj);
  safePlay();
  modelReady();
}

/* meshopt-compressed geometry — the decoder resolves through the same
   three/addons/ import-map prefix the rest of the scene uses. */
new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
  ASSETS.model || (FINAL + 'hero-rig.glb'),
  gltf => {
    const model = gltf.scene;
    /* scale first, then measure again — position is not affected by scale in a
       three.js local transform, so centring before scaling does not centre. */
    const raw = new THREE.Box3().setFromObject(model);
    model.scale.multiplyScalar(RIG_TARGET_DIAG / raw.getSize(new THREE.Vector3()).length());
    model.scale.y *= RIG_Y_STRETCH;
    model.updateMatrixWorld(true);

    /* Measured BEFORE the screen meshes are parented in, so they cannot inflate
       the box the ceiling alignment is computed from. */
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    model.position.sub(c);                       /* bbox centre -> rigBody origin, X/Z on axis */
    /* Hang it so the canopy's OUTER RIM touches the dome, not so its centre
       touches the pole — the canopy is flat and the dome is not, so pinning at
       the pole leaves the rim sticking through the ceiling. */
    const rXZ = Math.max(Math.hypot(box.max.x, box.max.z), Math.hypot(box.min.x, box.min.z));
    CANOPY_R = rXZ;
    if (ceilingMat) ceilingMat.uniforms.uCanopyR.value = CANOPY_R;
    rigBody.position.y = domeYatRadius(rXZ) - size.y / 2;
    ORBIT_Y = rigBody.position.y;                /* == the model's centre, the new orbit centre */

    /* Self-illuminated veins. The machine should light itself rather than only
       being lit from outside — that is what reads as "energy machine" instead
       of "green statue". There is no separate emissive map, so the brightest
       parts of the basecolor become the emitter: luminance raised to a power so
       only the top of the range survives, then pushed through the §2 accent.
       (Removed — see the note at the material below.) */
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    let glbMesh = null;
    model.traverse(o => {
      if (!o.isMesh || !o.material) return;
      o.material.envMapIntensity = ENV_INTENSITY;
      /* No emissive injection. It was pushing the basecolor through the accent
         and adding a forced green glow on top of the GLB's own PBR — exactly
         the "green multiply" that flattened the material. The maps are left to
         speak for themselves. */
      o.material.needsUpdate = true;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        if (o.material[k]) { o.material[k].anisotropy = maxAniso; o.material[k].needsUpdate = true; }
      }
      if (!glbMesh || o.geometry.attributes.position.count > glbMesh.geometry.attributes.position.count) glbMesh = o;
    });

    /* the video surfaces, cut from the mesh's own display faces */
    if (glbMesh) {
      const faces = extractScreenFaces(glbMesh);
      faces.forEach((f, i) => {
        if (!f) { console.error('[hero] no display face found for screen', i + 1); return; }
        const m = new THREE.Mesh(f.geometry, screenMaterial(screens[i].tex));
        /* coplanar with the face it was cut from — offset in depth, not in space */
        m.material.polygonOffset = true;
        m.material.polygonOffsetFactor = -2;
        m.material.polygonOffsetUnits = -2;
        glbMesh.add(m);
        screens[i].mesh = m;
        screens[i].normal.copy(f.normal);
        screens[i].centre.copy(f.centre);
      });
      console.log('[hero] screen faces:', faces.map((f, i) =>
        f ? `s${i + 1} ${f.tris} tris (-${f.dropped} outliers) ${f.size[0].toFixed(3)}x${f.size[1].toFixed(3)}` : `s${i + 1} MISSING`).join(' | '));
    }

    mountRig(model);

    /* assert the mount is flush — computed, not eyeballed */
    rig.updateMatrixWorld(true);
    const wb = new THREE.Box3().setFromObject(model);
    const wr = Math.max(Math.hypot(wb.max.x, wb.max.z), Math.hypot(wb.min.x, wb.min.z));
    const seatGap = wb.max.y - domeYatRadius(wr);        /* at the rim: must be 0 */
    const poleGap = domeYatRadius(0) - wb.max.y;          /* at the centre: small and positive */
    console.log(`[hero] ceiling seat: top=${wb.max.y.toFixed(6)} rim r=${wr.toFixed(3)} ` +
                `domeAtRim=${domeYatRadius(wr).toFixed(6)} seatGap=${seatGap.toFixed(6)} ` +
                `clearanceAtPole=${poleGap.toFixed(6)}`);
    if (Math.abs(seatGap) > 1e-4) console.error('[hero] canopy is not seated on the dome:', seatGap);
    if (poleGap < -1e-4) console.error('[hero] canopy pierces the dome at the pole:', poleGap);
  },
  undefined,
  err => {
    /* loud, not a silent stand-in: there is no procedural fallback any more */
    console.error('[hero] rig failed to load:', ASSETS.model || (FINAL + 'hero-rig.glb'), err);
    mountRig(null);   /* screens still mount, so the failure is loud but not a black frame */
  }
);

/* ---------------------------------------------------------------- INTRO
   Camera starts pushed out along screen s3's normal and dollies back to the
   idle view over 4000ms with no hold; from t=0.45 a quadratically ramping
   spin accumulates so the dolly blends straight into the idle rotation. */
const INTRO_HOLD = 0;
const INTRO_DUR = 4000;
const SPIN_RATE = Math.PI * 2 * 0.6 / 60;   /* rad/s */
const INTRO_UP = new THREE.Vector3(0, 1, 0);
const introFromPos = new THREE.Vector3();
const introFromLook = new THREE.Vector3();
const introToPos = new THREE.Vector3(-2.62, 0.762, -2.145);   /* matches the polar clamp — no snap */
const introToLook = new THREE.Vector3(0, 0, 0);
let introStart = -1, introPrev = 0, introSpin = 0, introRunning = false;

const videoP = new Promise(res => {
  if (s3.v.readyState >= 2) return res();
  s3.v.addEventListener('loadeddata', res, { once: true });
  s3.v.addEventListener('canplay', res, { once: true });
});
const heroVideoP = Promise.race([videoP, new Promise(res => setTimeout(res, 1600))]);
const timeoutP = new Promise(res => setTimeout(res, 3200));       /* safety only */
const minLoaderP = new Promise(res => setTimeout(res, 650));      /* fast, not a blink */

Promise.all([Promise.race([Promise.all([modelP, heroVideoP]), timeoutP]), minLoaderP]).then(() => {
  try {
    rig.updateMatrixWorld(true);
    /* re-centre the orbit on the machine now that its height is known */
    introToLook.set(0, ORBIT_Y, 0);
    introToPos.set(ORBIT_XZ[0], ORBIT_Y + ORBIT_RISE, ORBIT_XZ[1]);
    controls.target.copy(introToLook);

    const normal = outwardNormal(s3);
    const dist = (0.65 / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1;
    introFromLook.copy(s3.mesh.localToWorld(s3.centre.clone()));
    introFromPos.copy(introFromLook).addScaledVector(normal, dist);
    camera.position.copy(introFromPos);
    camera.lookAt(introFromLook);
    controls.enabled = false;
    introRunning = true;
    introStart = -1;   /* stamped on the first rendered frame */
  } catch (e) {
    introRunning = false;
    controls.enabled = true;
    camera.position.set(ORBIT_XZ[0], ORBIT_Y + ORBIT_RISE, ORBIT_XZ[1]);
    camera.lookAt(0, ORBIT_Y, 0);
    controls.target.set(0, ORBIT_Y, 0);
  }

  /* Compile every material now, while nothing is on screen yet. Without this
     the first frame of the dolly pays for the PBR + video shader compiles and
     visibly hitches right as the motion starts. */
  renderer.compile(scene, camera);

  const pre = document.getElementById('preloader');
  if (pre) pre.style.display = 'none';
  /* Only now does the scene start drawing — see the sceneReady gate in
     animate(). Before this the camera was still at its construction pose, so
     rendering meant showing a wrong-angle view of a half-loaded rig and then
     snapping to the dolly's start. That snap was the refresh glitch. */
  sceneReady = true;
  requestAnimationFrame(() => window.dispatchEvent(new Event('hero:ready')));
});

/* -------------------------------------------------------------- CONTROLS */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
/* auto-rotation is applied by hand in animate() so the intro hands off with
   zero velocity jump — OrbitControls' damped autoRotate ramps from 0 and hitches */
controls.autoRotate = false;
/* Vertical drag range. This used to be [1.35, 1.65] — a 17 degree band with the
   camera resting at 1.60, which left about 0.05 rad of downward travel and made
   the up/down drag feel dead.
   The upper bound is set by the ceiling, not by taste: the orbit target sits at
   y -0.098 with a radius of 3.473, so the camera height is
   -0.098 + 3.473*cos(polar). Polar 1.38 already puts it at y 0.561, only 0.06
   under the dome's pole at CEILING_Y 0.62 — legal, but that close the dome
   flattens to an edge-on band and stops reading as a ceiling. 1.42 keeps it
   0.20 clear, which holds the dome at every angle in the range. Below ~1.36 the
   camera climbs above the ceiling outright and the "hanging in a room" read
   collapses.
   So the top end stays tight and the range opens downward instead, where
   nothing is in the way. 1.42..2.15 is 42 degrees against the old 17, and the
   direction that was dead (down, 0.05 rad) is now the roomy one (0.55). */
controls.minPolarAngle = 1.42;   /* camera y 0.424 — keeps the dome readable */
controls.maxPolarAngle = 2.15;   /* camera y -2.14 — looking up from below */
controls.rotateSpeed = 0.55;     /* was 0.4; the wider band wants a bit more travel per px */
controls.enableZoom = false;
controls.enablePan = false;
let userHold = false;
controls.addEventListener('start', () => { userHold = true; });
controls.addEventListener('end', () => { userHold = false; });
/* vertical swipes scroll the page on touch; horizontal drags still rotate */
renderer.domElement.style.touchAction = 'pan-y';

/* -------------------------------------------------------- POSTPROCESSING */
const composer = new EffectComposer(renderer);
composer.renderTarget1.texture.generateMipmaps = false;
composer.renderTarget2.texture.generateMipmaps = false;
composer.addPass(new RenderPass(scene, camera));
/* BokehPass is gone. Its depth-of-field was the mush over the whole machine:
   focus 1.2 with the rig spanning ~0.9 in depth put most of the mesh outside
   the focal plane, so the geometry never resolved.
   Bloom is pulled back hard as well — strength 0.8 -> 0.45, radius 0.6 -> 0.18,
   threshold 0.2 -> 0.72. At threshold 0.2 almost every lit surface bloomed and
   smeared; at 0.85 the machine went black. 0.72 blooms the highlights only, so
   edges stay edges and screen text stays readable. Its buffer is sized in
   device pixels to match the real pixel ratio. */
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(container.clientWidth * heroPixelRatio(), container.clientHeight * heroPixelRatio()),
  0.20,   /* strength  — was 0.45 */
  0.14,   /* radius    — tight so it never softens an edge */
  0.90);  /* threshold — only the specular hotspots bloom, nothing else */
composer.addPass(bloomPass);
/* Grain kept at a whisper, scanlines off entirely (they were the crawl). Set
   FILM_STRENGTH to 0 to drop the pass's contribution completely. */
const FILM_STRENGTH = 0.06;   /* was 0.10 — grain is not where the mood comes from */
const filmPass = new FilmPass(FILM_STRENGTH, 0.0, 700, false);
composer.addPass(filmPass);

/* ------------------------------------------------------------- GRADE
   The complaint this answers: everything sat at one value and one hue, so the
   image had no tonal range. Three things, all cheap, all sharp — no blur:
     - split-tone. Shadows are pulled toward teal and highlights toward mint, so
       the darks and the lights stop being the same green. This is what gives
       the frame somewhere to go between black and accent.
     - a contrast curve about a low pivot, which deepens the shadows toward
       near-black without crushing the screens.
     - a vignette, to stop the corners competing with the centre.
   GRADE_* below are the only knobs; none of them soften an edge. */
/* Near-neutral. The old teal/mint split-tone was re-introducing hue into a
   frame that is now meant to be neutral except for the model. */
const GRADE_SHADOW   = new THREE.Color(0xa9b6c4);  /* a whisper cool in the darks */
const GRADE_HIGH     = new THREE.Color(0xffffff);  /* highlights stay white       */
const GRADE_CONTRAST = 1.06;
const GRADE_PIVOT    = 0.16;   /* low pivot was crushing the grey backdrop to black */
const GRADE_VIGNETTE = 0.42;
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uShadow: { value: GRADE_SHADOW }, uHigh: { value: GRADE_HIGH },
    uContrast: { value: GRADE_CONTRAST }, uPivot: { value: GRADE_PIVOT },
    uVig: { value: GRADE_VIGNETTE }
  },
  vertexShader: `varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uShadow; uniform vec3 uHigh;
    uniform float uContrast; uniform float uPivot; uniform float uVig; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));

      /* split-tone: darks toward teal, lights toward mint */
      float t = smoothstep(0.02, 0.55, l);
      vec3 tint = mix(uShadow, uHigh, t);
      c.rgb *= mix(vec3(1.0), tint, 0.14);

      /* contrast about a low pivot — deepens shadows, leaves highlights alone */
      c.rgb = clamp((c.rgb - uPivot) * uContrast + uPivot, 0.0, 1.0);

      /* vignette */
      vec2 d = vUv - 0.5;
      c.rgb *= clamp(1.0 - uVig * dot(d, d) * 1.9, 0.0, 1.0);

      gl_FragColor = c;
    }`
});
composer.addPass(gradePass);

/* ------------------------------------------------------------- RESIZE */
new ResizeObserver(() => {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pr = heroPixelRatio();
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  /* EffectComposer multiplies by the renderer's pixel ratio internally, so it
     gets the CSS size here — passing device px would square the ratio. */
  composer.setSize(w, h);
  bloomPass.setSize(w * pr, h * pr);
}).observe(container);
/* chrome.js rescale() changes __SCALE without changing container.clientWidth,
   so the ResizeObserver never fires — watch the window too. */
addEventListener('resize', () => {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  const pr = heroPixelRatio();
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w * pr, h * pr);
});

/* -------------------------------------------------------- RENDER LOOP */
/* Nothing is drawn until the rig is loaded, the dolly is armed and the shaders
   are compiled. The canvas is transparent over a black page until then, so the
   preloader is all that shows and the hero opens on the dolly's first frame. */
let sceneReady = false;
let visible = true;
new IntersectionObserver(e => {
  visible = e[0].isIntersecting;
  if (visible) safePlay(); else screens.forEach(s => s.v.pause());
}, { threshold: 0 }).observe(container);

const introLookNow = new THREE.Vector3();
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function animate() {
  requestAnimationFrame(animate);
  if (!sceneReady || !visible || document.hidden) return;
  const nowMs = performance.now();
  const dt = Math.min((nowMs - introPrev) / 1000, 0.05); introPrev = nowMs;

  if (introRunning) {
    if (introStart < 0) { introStart = nowMs; introPrev = nowMs; }
    const t = Math.min(Math.max((nowMs - introStart - INTRO_HOLD) / INTRO_DUR, 0), 1);
    const e = easeInOutCubic(t);
    camera.position.lerpVectors(introFromPos, introToPos, e);
    /* blend idle auto-rotation into the intro tail — no dead stop at hand-off */
    introSpin += SPIN_RATE * dt * Math.pow(Math.max((t - 0.45) / 0.55, 0), 2);
    camera.position.sub(introToLook).applyAxisAngle(INTRO_UP, -introSpin).add(introToLook);
    camera.lookAt(introLookNow.lerpVectors(introFromLook, introToLook, e));
    if (t >= 1) {
      introRunning = false;
      controls.enabled = true;
      controls.target.copy(introToLook);
      controls.update();
    }
  } else {
    /* manual idle spin — identical motion to the intro tail, so no velocity jump */
    if (!userHold) camera.position.sub(controls.target).applyAxisAngle(INTRO_UP, -SPIN_RATE * dt).add(controls.target);
    controls.update();
  }

  /* Scroll drives exactly one thing: the body's spin about its own vertical
     axis. No lift, no tilt, no mouse parallax — those were what made the rig
     wander off the ceiling and wobble. */
  const sc = window.scrollY / (window.innerWidth / 1024);
  rig.rotation.y += (sc * SCROLL_SPIN - rig.rotation.y) * 0.07;

  composer.render();
}
animate();

/* ------------------------------------------------------------ TUNE MODE
   Dev inspection only, ?tune=1. There is nothing left to nudge — the screens
   are geometry cut from the GLB's own display faces, so their placement is not
   adjustable by transform any more. This just exposes the handles.
   Nothing below runs unless the flag is present. */
if (TUNE) {
  window.__THREE = THREE;
  window.__screens = screens;
  window.__rig = rig;
  window.__rigBody = rigBody;
  window.__cam = camera;
  window.__controls = controls;
  window.__renderer = renderer;
  window.__film = filmPass;      /* .enabled = false to preview with no grain */
  window.__bloom = bloomPass;
  window.__grade = gradePass;
  window.__screenGain = SCREEN_GAIN;
  window.__spot = spotLight;
  window.__rim = rimLight;
  console.log('[tune] on — __screens/__rig/__rigBody/__cam/__controls/__renderer/__film/__bloom');
}
