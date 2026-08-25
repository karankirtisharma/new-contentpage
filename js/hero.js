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

const ASSETS = window.HERO_ASSETS || {};
const FINAL = ASSETS.finalDir || 'assets-final/';
const PLACE = ASSETS.placeholderDir || 'placeholders/';

/* §2 green token system, mirrored into the WebGL side */
const ACCENT = 0x19e65a;          /* signal accent, floor lines + ring */
const HOT_CORE = 0xb8ffcc;        /* mint-white hot tier, ring core    */
const RIM = 0x4dff7a;             /* rim light   (was 0xff4d4d)        */
const FILL = 0x1aff5e;            /* fill light  (was 0xff1a1a)        */
const AMBIENT = 0x405a4a;         /* cool green-grey (was 0x404060)    */

/* --------------------------------------------------- RIG NORMALISATION
   Tunables for fitting assets-final/hero-rig.glb into the scene. The model is
   centred on its bounding box and scaled uniformly so its diagonal matches
   RIG_TARGET_DIAG; RIG_Y_STRETCH is deliberately 1.0 — the 1.2 that used to
   live here was tuned for the procedural box mast and visibly distorts a real
   asset. */
const RIG_TARGET_DIAG = 2.0;    /* world-space diagonal the model is scaled to */
const RIG_Y_STRETCH   = 1.0;    /* was 1.2 — a box-rig hack, never for a real asset */
const CEILING_Y       = 0.62;   /* mount plane: the model's bbox top lands exactly here */
const CEILING_R       = 2.3;    /* bounded on purpose — see the note on the ceiling mesh */
const SCROLL_SPIN     = 0.0016; /* radians of rig.rotation.y per scrolled design-px */

/* dev-only placement mode, ?tune=1 — see TUNE MODE at the foot of this file */
const TUNE = new URLSearchParams(location.search).get('tune') === '1';

const container = document.getElementById('scene3d');
const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(28.5, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(-2.2, 1.9, -1.8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.setClearColor(0x000000, 0);
const HERO_DPR = 1.0;   /* hard cap — the grain/scanline aesthetic hides it */
renderer.setPixelRatio(HERO_DPR);
renderer.setSize(container.clientWidth, container.clientHeight);
/* The rig is the first textured PBR asset in this scene, so the output chain
   finally has to be right: sRGB out, ACES filmic in. Tone mapping applies to
   lit materials only — the accent lines and the screen planes opt out below,
   so the §2 palette lands exactly where it did before. */
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

/* ---------------------------------------------------------------- LIGHTS */
scene.add(new THREE.AmbientLight(AMBIENT, 0.3));
const spotLight = new THREE.SpotLight(0xffffff, 40);
spotLight.position.set(0, 3, 0.5);
spotLight.target.position.set(0, 0, 0);
spotLight.angle = Math.PI / 5;
spotLight.penumbra = 0.3;
spotLight.decay = 2;
spotLight.distance = 15;
scene.add(spotLight, spotLight.target);

const rimLight = new THREE.DirectionalLight(RIM, 1.2);
rimLight.position.set(-2, 2, -2);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(FILL, 0.8);
fillLight.position.set(2, 1, 2);
scene.add(fillLight);

/* --------------------------------------------------------- ENVIRONMENT
   The rig's material is metalness 0.88 / roughness 0.07 — a near-mirror. A
   metal that smooth reflects its surroundings and almost nothing else, so with
   no environment it renders as a black silhouette no matter how the lights are
   set. This builds one procedurally out of the §2 tokens (no new asset, no new
   dependency): a dark-to-accent vertical gradient plus a mint-white key card
   where the spot sits, so every reflection the machine picks up is already in
   the palette. Tune ENV_INTENSITY, not the lights, to change how hot it reads. */
const ENV_INTENSITY = 5.0;
{
  const envScene = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(8, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uLo: { value: new THREE.Color(0x02160b) }, uHi: { value: new THREE.Color(ACCENT) } },
      vertexShader: `varying float vY;
        void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uLo; uniform vec3 uHi; varying float vY;
        void main(){ gl_FragColor = vec4(mix(uLo, uHi * 0.42, smoothstep(-0.35, 0.95, vY)), 1.0); }`
    })
  );
  envScene.add(shell);
  /* key card overhead, matching the spot at (0,3,0.5) — gives the metal an edge
     to catch instead of a flat wash */
  const key = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ color: HOT_CORE }));
  key.position.set(0, 6.5, 1); key.rotation.x = Math.PI / 2;
  envScene.add(key);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
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
  /* Shaded by hand rather than lit: every light sits above this plane, so a lit
     material would leave the underside pure black and the mount would read as
     nothing. Instead a dark disc that fades out before its own rim (no hard
     edge in frame) with an accent pool around the mount point.

     Bounded, not infinite, and deliberately so. The idle camera sits at eye
     height 0.762 looking at the origin with a 28.5 deg FOV, which leaves only
     ~1.5 deg of frame above eye level: an infinite ceiling plane at any height
     the machine can also fit under is either backfaced (invisible) or, seen
     from above, floods the lower frame like a floor. A disc reads as the plate
     the machine is bolted to without either failure. See DECISIONS.md — the
     real fix is raising the orbit target, which needs sign-off. */
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(CEILING_R, 64),
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { uCol: { value: new THREE.Color(ACCENT) }, uBase: { value: new THREE.Color(0x070d09) } },
      vertexShader: `varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform vec3 uBase; varying vec2 vUv;
        void main(){
          float d = length(vUv - 0.5) * 2.0;              /* 0 at the mount, 1 at the rim */
          float pool = 1.0 - smoothstep(0.0, 0.14, d);    /* accent spill around the fixture */
          float slab = 1.0 - smoothstep(0.30, 0.95, d);   /* slab fades before its own edge */
          gl_FragColor = vec4(uBase + uCol * 0.13 * pool, clamp(slab + pool * 0.6, 0.0, 1.0));
        }`
    })
  );
  ceiling.rotation.x = Math.PI / 2;   /* face down, toward the camera */
  ceiling.position.y = CEILING_Y;
  ceiling.renderOrder = -1;
  scene.add(ceiling);
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
const uGrade = { value: ASSETS.screenGrade ?? 1 };
function screenMaterial(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
  m.onBeforeCompile = shader => {
    shader.uniforms.uGrade = uGrade;
    shader.fragmentShader = `uniform float uGrade;\n${GREEN_RAMP}\n` + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       {
         float l = pow(clamp(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722)), 0.0, 1.0), 1.0 / 2.2);
         vec3 graded = pow(greenRamp(clamp(l * 1.15, 0.0, 1.0)), vec3(2.2));
         diffuseColor.rgb = mix(diffuseColor.rgb, graded, uGrade);
       }`
    );
  };
  return m;
}

function makeVideo(i, flip) {
  const name = NAMES[i];
  /* final asset -> free stock URL -> local procedural loop. The last step is
     offline-proof, so a blocked or rate-limited CDN never blocks the build. */
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
  if (flip) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1; }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMaterial(tex));
  return { v, tex, mesh };
}
const NAMES = ASSETS.screens || ['screen-a.mp4', 'screen-b.mp4', 'screen-c.mp4', 'screen-d.mp4'];
const STOCK = ASSETS.stock || [];

/* Screen placement. The rig carries four monitor frames on arms that radiate
   along the XZ diagonals, so the video planes are seated in those frames. Each
   frame's front face was fitted from the mesh's own vertex normals — the subset
   whose normal points outward along that quadrant's diagonal — which isolates
   the flat screen face from the arm and bracket behind it.

   Fitted with the model normalised to diagonal FIT_DIAG: face centre
   (+-0.445, -0.087, +-0.453), face 0.708 x 0.572, canted 4.9 deg nose-down.
   The planes are inset to 0.640 x 0.500 so they sit inside the bezel, and
   pushed 0.063 out along the face normal — the bezel relief stands ~0.048
   proud of the fitted plane, so any less and the frame pokes through the video.

   Everything is expressed as fitted-value x K, so RIG_TARGET_DIAG is a real
   knob: retune it and the screens scale with the model instead of tearing off.
   Positions are relative to the model's bbox centre = rigBody's local origin.

   CAVEAT: the GLB is one fused mesh (1 node, 1 material, 0 draw groups) with no
   separable bezel nodes, so these planes cannot be parented to real screen
   geometry. The transforms are measured off the mesh, not hand-placed. */
const FIT_DIAG = 2.8;
const K = RIG_TARGET_DIAG / FIT_DIAG;
const SP = 0.086;                       /* the frames' own downward cant */
const PX = 0.489 * K, PY = -0.092 * K, PZ = 0.497 * K;
const SW = 0.640 * K, SH = 0.500 * K;

const s1 = makeVideo(0);          /* faces X+ Z- */
s1.mesh.scale.set(SW, SH, 1); s1.mesh.position.set(PX, PY, -PZ); s1.mesh.rotation.set(SP, 2.358, 0, 'YXZ');
const s2 = makeVideo(1);          /* faces X+ Z+ */
s2.mesh.scale.set(SW, SH, 1); s2.mesh.position.set(PX, PY, PZ); s2.mesh.rotation.set(SP, 0.781, 0, 'YXZ');
const s3 = makeVideo(2);          /* faces X- Z- — the intro dollies out from this one */
s3.mesh.scale.set(SW, SH, 1); s3.mesh.position.set(-PX, PY, -PZ); s3.mesh.rotation.set(SP, -2.358, 0, 'YXZ');
const s4 = makeVideo(3, true);    /* faces X- Z+ */
s4.mesh.scale.set(SW, SH, 1); s4.mesh.position.set(-PX, PY, PZ); s4.mesh.rotation.set(SP, -0.781, 0, 'YXZ');
const screens = [s1, s2, s3, s4];
function safePlay() { screens.forEach(s => s.v.play().catch(() => {})); }

/* ------------------------------------------------------------- THE RIG */
/* World-space, because the screens now live two groups deep (rig > rigBody)
   instead of directly in the scene. Same rule as before, same result — the
   intro's start pose is unchanged. */
function outwardNormal(mesh) {
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  if (n.dot(mesh.getWorldPosition(new THREE.Vector3())) < 0) n.negate();
  return n;
}

let modelReady;
const modelP = new Promise(res => { modelReady = res; });
function mountRig(obj) {
  if (obj) rigBody.add(obj);
  /* Screens join the same body as the model. Their constants are already in
     model-centred space, so they need no offset — and because they share a
     parent with the model, nothing can slide out from under them again. */
  screens.forEach(s => rigBody.add(s.mesh));
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

    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    /* bbox centre to rigBody's origin: the screen constants are measured from
       exactly this point, and rigBody is what spins. */
    model.position.sub(c);
    /* then hang the whole body so the model's top touches the ceiling exactly */
    rigBody.position.y = CEILING_Y - box.getSize(new THREE.Vector3()).y / 2;

    model.traverse(o => { if (o.isMesh && o.material) o.material.envMapIntensity = ENV_INTENSITY; });
    mountRig(model);
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
    const normal = outwardNormal(s3.mesh);
    const dist = (0.65 / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1;
    s3.mesh.getWorldPosition(introFromLook);
    introFromPos.copy(introFromLook).addScaledVector(normal, dist);
    camera.position.copy(introFromPos);
    camera.lookAt(introFromLook);
    controls.enabled = false;
    introRunning = true;
    introStart = -1;   /* stamped on the first rendered frame */
  } catch (e) {
    introRunning = false;
    controls.enabled = true;
  }
  const pre = document.getElementById('preloader');
  if (pre) pre.style.display = 'none';
  requestAnimationFrame(() => window.dispatchEvent(new Event('hero:ready')));
});

/* -------------------------------------------------------------- CONTROLS */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.4;
/* auto-rotation is applied by hand in animate() so the intro hands off with
   zero velocity jump — OrbitControls' damped autoRotate ramps from 0 and hitches */
controls.autoRotate = false;
controls.minPolarAngle = 1.35;
controls.maxPolarAngle = 1.65;
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
   Bloom is pulled back hard as well — strength 0.8 -> 0.30, radius 0.6 -> 0.20,
   threshold 0.2 -> 0.70. At threshold 0.2 almost every lit surface bloomed;
   at 0.70 only the genuinely hot pixels do, so edges stay edges. */
composer.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.30, 0.20, 0.70));
/* Grain kept at a whisper, scanlines off entirely (they were the crawl). Set
   FILM_STRENGTH to 0 to drop the pass's contribution completely. */
const FILM_STRENGTH = 0.10;
const filmPass = new FilmPass(FILM_STRENGTH, 0.0, 700, false);
composer.addPass(filmPass);

/* ------------------------------------------------------------- RESIZE */
new ResizeObserver(() => {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(HERO_DPR);
  renderer.setSize(w, h);
  composer.setSize(w, h);
}).observe(container);

/* -------------------------------------------------------- RENDER LOOP */
let visible = true;
new IntersectionObserver(e => {
  visible = e[0].isIntersecting;
  if (visible) safePlay(); else screens.forEach(s => s.v.pause());
}, { threshold: 0 }).observe(container);

const introLookNow = new THREE.Vector3();
const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function animate() {
  requestAnimationFrame(animate);
  if (!visible || document.hidden) return;
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
   Dev-only screen placement, ?tune=1. Nothing below binds a listener or
   touches the scene unless the flag is present.
     1-4          select a screen
     arrows       translate in the screen's own plane (Up/Down = its up axis)
     shift+arrows rotate (Left/Right = yaw, Up/Down = pitch)
     [ / ]        scale down / up
     P            log the current transform as paste-ready .set(...) lines
*/
if (TUNE) {
  window.__screens = [s1, s2, s3, s4];
  window.__rig = rig;
  window.__rigBody = rigBody;
  window.__film = filmPass;       /* .enabled = false to preview with no grain */
  window.__cam = camera;          /* dev inspection only */
  window.__controls = controls;
  let sel = 0;
  const STEP = 0.005, ROT = 0.005, SCL = 1.02;
  const log = () => {
    const m = screens[sel].mesh, p = m.position, r = m.rotation, c = m.scale;
    console.log(
      `s${sel + 1}.mesh.scale.set(${c.x.toFixed(3)}, ${c.y.toFixed(3)}, 1); ` +
      `s${sel + 1}.mesh.position.set(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}); ` +
      `s${sel + 1}.mesh.rotation.set(${r.x.toFixed(3)}, ${r.y.toFixed(3)}, ${r.z.toFixed(3)}, 'YXZ');`
    );
  };
  addEventListener('keydown', e => {
    if (e.key >= '1' && e.key <= '4') { sel = +e.key - 1; console.log('[tune] screen', sel + 1); return; }
    const m = screens[sel].mesh;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion);
    let hit = true;
    switch (e.key) {
      case 'ArrowLeft':  e.shiftKey ? m.rotation.y -= ROT : m.position.addScaledVector(right, -STEP); break;
      case 'ArrowRight': e.shiftKey ? m.rotation.y += ROT : m.position.addScaledVector(right, STEP); break;
      case 'ArrowUp':    e.shiftKey ? m.rotation.x -= ROT : m.position.addScaledVector(up, STEP); break;
      case 'ArrowDown':  e.shiftKey ? m.rotation.x += ROT : m.position.addScaledVector(up, -STEP); break;
      case '[': m.scale.x /= SCL; m.scale.y /= SCL; break;
      case ']': m.scale.x *= SCL; m.scale.y *= SCL; break;
      case 'p': case 'P': log(); break;
      default: hit = false;
    }
    if (hit) e.preventDefault();
  });
  console.log('[tune] on — 1-4 select, arrows move, shift+arrows rotate, [ ] scale, P to log');
}
