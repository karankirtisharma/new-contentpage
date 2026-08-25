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
/* Radians of cap. 0.145 put the geometric rim at r 10.1, which was inside the
   frustum — the surface simply stopped, and a ceiling that stops is a saucer.
   0.30 puts it at r 20.7 and y -2.5, well outside the frame at the locked orbit
   angle, and the shader has faded the surface to nothing long before that. The
   segment counts are independent of the arc, so this costs no triangles. */
const CEILING_ARC     = 0.30;   /* radians of cap; rim lands at r ~20.7, far outside frame */
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
/* The resting polar angle, derived rather than typed: the camera sits at
   ORBIT_XZ with ORBIT_RISE of height relative to the target, so this is the
   angle the intro dolly lands on and the angle the orbit is now locked to.
   Retuning ORBIT_RISE or ORBIT_XZ moves the lock with it. */
const ORBIT_POLAR     = Math.atan2(Math.hypot(ORBIT_XZ[0], ORBIT_XZ[1]), ORBIT_RISE);
const ORBIT_RADIUS    = Math.hypot(ORBIT_XZ[0], ORBIT_XZ[1], ORBIT_RISE);

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
renderer.toneMappingExposure = 1.0;    /* 0.95 -> 1.0 with the white studio; the model's albedo is dark green and needs it */
container.appendChild(renderer.domElement);

/* ---------------------------------------------------------------- LIGHTS
   Torn down and rebuilt as a plain white studio.

   What was here before was a *look*: a 26-intensity spot jammed against the
   mount with decay 2, a rim and a fill, each on its own tint, sculpting the
   machine into something the asset was never authored to be. Combined with a
   near-mirror material (see MATERIAL below) it produced the blown green
   highlights down the spine — light that was being performed at the model
   rather than falling on it.

   Every light is now pure white and there is no styling left in the rig at
   all: a soft overhead from the fixture the machine hangs from, a 3/4 key, a
   weaker fill opposite it, and a back light for the silhouette. Classic
   three-point plus a practical. Nothing tints, nothing sculpts — the hue in
   the frame is the GLB's own basecolor and only that.

   Intensities are low on purpose. The material below is diffuse-dominant now,
   so it actually *takes* light instead of only mirroring it, and the values
   that used to be needed to make a mirror visible would blow a diffuse
   surface flat white. */
const LIGHT_WHITE = 0xffffff;     /* every light in the scene, no exceptions */
const KEY_TINT    = LIGHT_WHITE;  /* the PMREM key card matches the practical */

/* base level — the shadow side is a shadow, not a hole */
scene.add(new THREE.AmbientLight(LIGHT_WHITE, 1.4));

/* The practical: the ceiling fixture the machine is bolted to. Kept because it
   is what motivates the pool drawn on the dome and the shaft under it — but
   softened right down (26 -> 9, angle 0.62 -> 0.80, penumbra 0.82 -> 0.95,
   decay 2 -> 1.5) so it reads as a room light spilling down the machine rather
   than a hotspot burning a hole in the top of it. */
const spotLight = new THREE.SpotLight(LIGHT_WHITE, 9);
spotLight.position.set(0, CEILING_Y + 1.6, 0);
spotLight.target.position.set(0, CEILING_Y - 2.4, 0);
spotLight.angle = 0.80;
spotLight.penumbra = 0.95;
spotLight.decay = 1.5;            /* softer than inverse-square; the pool reaches the base */
spotLight.distance = 13;
scene.add(spotLight, spotLight.target);

/* KEY — the light that actually shows the model its own colour. Front-left and
   above, the standard 3/4 position; world-fixed, so the machine is modelled by
   it differently at each point of the orbit instead of looking identical from
   every angle. */
const keyLight = new THREE.DirectionalLight(LIGHT_WHITE, 3.6);
keyLight.position.set(-2.6, 2.2, -1.9);
scene.add(keyLight);

/* FILL — opposite the key, roughly a third of it, so the far side keeps its
   form without the two cancelling into flat, even lighting */
const fillLight = new THREE.DirectionalLight(LIGHT_WHITE, 1.2);
fillLight.position.set(2.8, 0.5, 1.6);
scene.add(fillLight);

/* BACK — grazing from behind and above, to lift the silhouette off the haze */
const rimLight = new THREE.DirectionalLight(LIGHT_WHITE, 1.5);
rimLight.position.set(1.6, 1.9, 2.6);
scene.add(rimLight);

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
   The rig's own MR map samples at metalness 0.96 / roughness 0.02 (medians,
   measured off the texture) — a full mirror over the entire model. That is why
   an environment was needed at all: a mirror reflects its surroundings and
   almost nothing else. The material is no longer left that way (see MATERIAL,
   at the loader), so the env's job is now reflections and wrap-around fill
   rather than being the light source of last resort.

   The env is generated at runtime with PMREMGenerator from the same palette
   and the same vertical gradient as the backdrop shell above, so what the
   metal reflects and what sits behind it agree instead of looking pasted
   together. Plus a mint key card at the mount, matching the spot, so the
   reflections have a bright edge to run along rather than a flat wash.
   No asset, no extra dependency.

   ENV_INTENSITY went 3.4 -> 1.6. It was tuned when the model was left as a
   near-mirror, where the environment was doing nearly all of the lighting and
   had to be pushed hard to make the metal visible at all. With the material
   remapped to a real surface (see MATERIAL, at the loader) the env is back to
   what it should be — reflections and soft wrap-around fill, not the primary
   light. At 3.4 against a diffuse surface it washes the basecolor straight
   out. */
const ENV_INTENSITY = 1.6;
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
     as nothing. There is no specular term here at all and never was — no
     roughness, no env, no reflection. What looked like a highlight on the
     ceiling's edge was a `halo` term this shader drew deliberately: a bright
     ring at exactly uCanopyR, i.e. traced along the canopy's rim. Measured on
     the rendered frame it took the surface from luminance 11 to 29 and back to
     0 inside 40px, which is what turned the dome into a saucer with a lit lip.
     It is gone. What is left is a soft dark surface, a pool where the fixture
     spills onto it, and fbm mottling.

     Two rules now hold everywhere on it:
       - it is darkest at the frame edges and lifted only around the mount, so
         the pool is the one thing that reads;
       - tone and coverage fade to zero TOGETHER (uBase is multiplied by `slab`,
         not added as a floor), so the surface dissolves into the void instead
         of ending. Verified by sampling four columns of the rendered frame: the
         largest step between adjacent 8px samples is 1-2 levels, against 18 at
         the old halo. There is no boundary to see at any point in the orbit.

     It is a shallow spherical cap, not a flat plane. Seen from underneath a
     flat plane collapses to a hard straight edge across the frame; a dome
     curves away at the sides and reads as something the room actually has. The
     cap's pole sits exactly at CEILING_Y, which is where the model's bbox top
     is placed, so the shaft meets it flush.

     NOT double geometry. The GLB brings its own disc — the machine's canopy,
     world radius CANOPY_R 1.651, fused into the single 149,812-tri mesh — and
     this dome is a separate surface of radius 70. The canopy is seated on the
     dome to a gap of -2e-6, but they cannot z-fight: this material has
     depthWrite false and renderOrder -1, so it paints first and the canopy
     draws cleanly over it. */
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
          float pool = 1.0 - smoothstep(uCanopyR * 0.35, uCanopyR * 2.6, vR);
          float slab = 1.0 - smoothstep(uCanopyR * 0.9,  uCanopyR * 5.0, vR);
          float grain = 0.6 + 0.4 * fbm(vec2(atan(vL.z, vL.x) * 3.0, vR * 1.1) * 2.6);
          /* uBase is SCALED by slab, not added to it — the surface's tone and its
             coverage have to reach zero at the same radius or the fade leaves a
             flat grey plateau that ends abruptly. */
          vec3 col = (uBase * slab + uCol * 0.10 * pool) * grain;
          gl_FragColor = vec4(col, clamp(slab * 0.50 + pool * 0.32, 0.0, 1.0));
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
/* The panels were unreadable — you could not tell there was video on them at
   all. Two things were doing it and both are backed off here.

   SCREEN_GAIN 0.26 -> 0.70. Gain multiplies in LINEAR space and the panels opt
   out of tone mapping, so 0.26 lands at 0.26^(1/2.2) = 0.54 of full value on
   screen — dimmer still once the vignette and contrast curve have had it. 0.70
   rather than higher: at 0.85 a bright clip's sky clipped flat and the panels
   started outshining the machine again.

   SCREEN_RAMP_DRIVE 0.62 -> 1.0. This is the one that actually hid the footage:
   it scales luminance before the tier lookup, so at 0.62 a mid-grey pixel
   (l 0.5) resolved at ramp position 0.31 — down in #0a3d1f, near-black. Every
   clip collapsed into the ramp's two darkest tiers and the image inside them
   went with it. At 1.0 mid-grey sits at #148f43->#19e65a and the content
   reads. They are still emissive panels on a dark rig, not the subject. */
const SCREEN_GAIN = { value: 0.70 };
const SCREEN_RAMP_DRIVE = 1.0;
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
         vec3 graded = pow(greenRamp(clamp(l * ${SCREEN_RAMP_DRIVE.toFixed(2)}, 0.0, 1.0)), vec3(2.2));
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

    /* ------------------------------------------------------------ MATERIAL
       The basecolor map is the model's design. Nothing here tints it, adds to
       it or glows it — the one thing that happens is that the surface is made
       able to SHOW it.

       Why that is needed: the asset is a Tripo bake, and its metallic-roughness
       map is degenerate. Measured over the whole 1024² texture, metalness is
       0.876 mean / 0.961 median and roughness 0.068 mean / 0.020 median — one
       flat near-perfect mirror across every part of the machine, panels, cables
       and hub alike. A metal surface has no diffuse response at all, so under
       ANY light a metalness-0.96 surface returns the environment, not its own
       colour, tinted by the basecolor at grazing incidence only. That is the
       blown, wet, hotspot-down-the-spine read — it was never lighting alone.

       So the map is kept, for its variation, and remapped: metalness scaled
       down to a faint sheen and roughness lifted out of mirror territory into a
       satin band. Same texture, same detail, but the basecolor is now what the
       white lights land on and come back from. Nothing else about the PBR is
       touched — no emissive, no tint, no accent multiply. */
    const METALNESS_SCALE = 0.15;   /* 0.96 map median -> 0.14: sheen, not chrome */
    const ROUGH_FLOOR     = 0.42;   /* what a map value of 0 becomes */
    const ROUGH_CEIL      = 0.90;   /* what a map value of 1 becomes */

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    let glbMesh = null;
    model.traverse(o => {
      if (!o.isMesh || !o.material) return;
      o.material.envMapIntensity = ENV_INTENSITY;
      /* The remap. Both chunks define their factor as `scalar * map channel`,
         so appending after the include rewrites the sampled value itself and
         the texture's variation survives the transform. */
      o.material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
             roughnessFactor = mix(${ROUGH_FLOOR.toFixed(2)}, ${ROUGH_CEIL.toFixed(2)}, roughnessFactor);`)
          .replace('#include <metalnessmap_fragment>',
            `#include <metalnessmap_fragment>
             metalnessFactor *= ${METALNESS_SCALE.toFixed(2)};`);
      };
      o.material.customProgramCacheKey = () => 'rig-mr-remap';
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
    /* The dolly is FLATTENED onto the locked orbit height. Measured before this
       line existed, it started 0.103 below the resting height and lifted its aim
       0.111 over the four seconds — the last vertical motion in the scene, and
       on every single load. Pinning both ends to the resting height makes
       camera.position.y and the aim height constant from the very first frame:
       the lerp has nothing to interpolate vertically, and the intro spin turns
       about Y, which cannot change height either.
       Nothing else about the intro moves — same push-out along s3's normal, same
       4000ms, same easing, same spin blend. Delete these two lines to get the
       vertical component back. */
    introFromLook.y = introToLook.y;
    introFromPos.y  = introToPos.y;
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
/* Vertical orbit is OFF. min and max polar are pinned to the same value, so
   OrbitControls clamps phi back to it on every update and a vertical drag is a
   no-op. Horizontal drag, the idle auto-spin and the intro dolly are untouched:
   all three rotate about Y, which does not change phi, so nothing else in the
   scene notices.
   The pinned value is ORBIT_POLAR, derived from ORBIT_XZ and ORBIT_RISE rather
   than typed in — which is also exactly the angle the intro dolly lands on, so
   the clamp is a no-op on hand-off and the camera cannot snap when controls
   take over. (The band used to be [1.42, 2.15].) */
controls.minPolarAngle = ORBIT_POLAR;
controls.maxPolarAngle = ORBIT_POLAR;
controls.rotateSpeed = 0.55;     /* horizontal only now, but the feel is unchanged */
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

/* ------------------------------------------------------------- HEIGHT LOCK
   Belt and braces on top of the min/max polar clamp. The clamp lives inside
   OrbitControls and only covers what OrbitControls itself does to the camera;
   this re-seats the camera onto its resting cone after every idle frame, so
   NOTHING — a stray drag, damping overshoot, a future edit, a different three
   version — can put it at another height. Cheap: two allocations at module
   scope, and the write is skipped entirely when the camera is already there. */
const _lockOff = new THREE.Vector3();
const _lockSph = new THREE.Spherical();
function lockCameraHeight() {
  _lockSph.setFromVector3(_lockOff.copy(camera.position).sub(controls.target));
  if (Math.abs(_lockSph.phi - ORBIT_POLAR) < 1e-9 && Math.abs(_lockSph.radius - ORBIT_RADIUS) < 1e-9) return;
  _lockSph.phi = ORBIT_POLAR;
  _lockSph.radius = ORBIT_RADIUS;
  camera.position.copy(controls.target).add(_lockOff.setFromSpherical(_lockSph));
  camera.lookAt(controls.target);
}

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
    lockCameraHeight();
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
  window.__composer = composer;   /* lets a QA capture force a frame without the rAF loop */
  window.__film = filmPass;      /* .enabled = false to preview with no grain */
  window.__bloom = bloomPass;
  window.__grade = gradePass;
  window.__screenGain = SCREEN_GAIN;
  window.__spot = spotLight;
  window.__rim = rimLight;
  console.log('[tune] on — __screens/__rig/__rigBody/__cam/__controls/__renderer/__film/__bloom');
}
