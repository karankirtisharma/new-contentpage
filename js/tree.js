/* =====================================================================
   SECTION 2 — the holographic tree.

   A separate WebGL context from the hero, sharing none of its state. What it
   DOES share is everything that was learned the hard way on the rig, because
   the asset is the same kind of thing: a Tripo export, one node, one mesh, one
   material, three maps, and the same degenerate metallic-roughness map.
   Measured on this model's own MR texture: metalness 0.913 mean / 0.965 median,
   roughness 0.053 / 0.004 — a near-perfect mirror over the whole tree. So the
   same remap applies, and the lights are the same plain white studio.

   Two things are different from the hero, and both come from the model:

     - It is a RELIEF, not an object in the round. Bounding box 0.980 x 0.721 x
       0.450: the depth is under half the width. It is built to be seen from the
       front, so there is no orbit here — a slow sway that never turns far
       enough to show how flat it is.

     - It has no flat display faces. The rig had four clean 0.78 x 0.63 panels
       that the video geometry was cut from; on the tree the largest coplanar
       clusters after the top and bottom caps are ~0.001 in area — fragments.
       The pods' holographic content is painted into the basecolor, not modelled.
       So the video planes here are placed, not extracted. See PODS.
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const ASSETS = window.TREE_ASSETS || {};
const container = document.getElementById('scene3d2');
if (container) init();

function init() {

/* ------------------------------------------------------------------ PODS
   Where the four video planes go, in fractions of the model's own bounding
   box — u across (0 = -x edge), v up (0 = base), z through (0 = back, 1 =
   front). Fractions rather than model units so the runtime fit can rescale the
   tree without dragging these out of place.

   Read off the reference frame and then refined against renders. The automatic
   route was tried first: bin every front-facing triangle into an 80x80 grid
   over the model's XY and peak-find. It does find the pods, but it also finds
   the glass shells around them and the branch junctions between them, and no
   suppression radius separated the four cleanly — one pod came back as four
   peaks at radius 7, and at radius 16 it merged neighbours instead. Curved
   shells simply do not cluster the way a flat panel does. Placing four planes
   and checking them against a render is both simpler and more accurate. */
const PODS = [
  { u: 0.206, v: 0.690, z: 0.72, w: 0.200, h: 0.170, rx: -0.42 },  /* upper left  */
  { u: 0.729, v: 0.653, z: 0.68, w: 0.210, h: 0.180, rx: -0.42 },  /* upper right */
  { u: 0.269, v: 0.312, z: 0.78, w: 0.250, h: 0.210, rx: -0.46 },  /* mid left, the big one */
  { u: 0.727, v: 0.268, z: 0.62, w: 0.190, h: 0.170, rx: -0.46 }   /* lower right */
];

/* the tree is framed to this fraction of the frame's height */
const FIT_HEIGHT = 0.86;
const TREE_FOV   = 30;
const SWAY_RAD   = 0.10;    /* half-angle of the sway; never enough to show the relief edge-on */
const SWAY_SECS  = 16;

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(TREE_FOV, container.clientWidth / container.clientHeight, 0.01, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false });
renderer.setClearColor(0x000000, 0);
/* Same reasoning as the hero: #scene3d2 is a fixed 1024-wide box that chrome.js
   scales, so container.clientWidth always reads 1024 while the canvas is drawn
   larger. The backing store has to cover the design scale AND the device ratio. */
const DPR_CAP = 2;
const pixelRatio = () => Math.min((window.devicePixelRatio || 1) * (window.__SCALE || 1), DPR_CAP);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/* higher than the hero's 1.0: this basecolor is darker still, mean sRGB
   (0.026, 0.143, 0.024) against the rig's (0.19, 0.31, 0.09) */
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

/* ---------------------------------------------------------------- LIGHTS
   Plain white studio, same rule as the hero: nothing tints, the hue in the
   frame is the model's own basecolor and only that. Intensities are up on the
   hero's because the albedo is roughly half as bright. */
const WHITE = 0xffffff;
/* Ambient is low on purpose. The first pass ran it at 1.8 and the tree came
   back a flat mid-green with no glow left in it: this basecolor is almost all
   dark with thin bright filaments, and lifting the floor lifts the dark far
   more than the filaments, which are already near the top of the range. Keeping
   the floor down is what lets the bright lines read as bright. */
scene.add(new THREE.AmbientLight(WHITE, 0.35));

const keyLight = new THREE.DirectionalLight(WHITE, 3.0);
keyLight.position.set(-1.6, 1.4, 2.6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(WHITE, 0.8);
fillLight.position.set(2.2, 0.2, 1.8);
scene.add(fillLight);

/* from behind, to separate the canopy from the black page */
const rimLight = new THREE.DirectionalLight(WHITE, 1.2);
rimLight.position.set(0.4, 1.8, -2.4);
scene.add(rimLight);

/* -------------------------------------------------------- ENVIRONMENT
   Needed for the same reason as on the rig: even after the remap below the
   surface keeps a metal sheen, and a metal with no environment returns black.
   A neutral studio gradient, built at runtime, no asset. */
const ENV_INTENSITY = 1.0;
{
  const envScene = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(8, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uLo: { value: new THREE.Color(0x1c2024) }, uHi: { value: new THREE.Color(0xc2ccd4) } },
      vertexShader: `varying vec3 vP;
        void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uLo; uniform vec3 uHi; varying vec3 vP;
        void main(){ gl_FragColor = vec4(mix(uLo, uHi, smoothstep(-0.7, 0.9, vP.y)), 1.0); }`
    })
  );
  envScene.add(shell);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  shell.geometry.dispose(); shell.material.dispose();
}

/* ------------------------------------------------------- VIDEO SCREENS */
/* The §2 tier ramp, same table as the hero's, so both sections speak one
   palette. Only the screen grade uses it. */
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

/* Brighter than the hero's 0.70: these panels sit INSIDE tinted glass pods and
   are read through them, so they lose a good deal on the way out. */
const SCREEN_GAIN = { value: 0.95 };
const uGrade = { value: ASSETS.screenGrade ?? 1 };

function screenMaterial(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.92 });
  m.onBeforeCompile = shader => {
    shader.uniforms.uGrade = uGrade;
    shader.uniforms.uGain = SCREEN_GAIN;
    shader.fragmentShader = `uniform float uGrade; uniform float uGain;\n${GREEN_RAMP}\n` + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       {
         float l = pow(clamp(dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722)), 0.0, 1.0), 1.0 / 2.2);
         vec3 graded = pow(greenRamp(clamp(l, 0.0, 1.0)), vec3(2.2));
         diffuseColor.rgb = mix(diffuseColor.rgb, graded, uGrade) * uGain;
         /* Mask to the dish. The pods are round and a rectangular video inside
            one reads as a sticker over the top of it; fading the quad out on an
            ellipse makes the footage belong to the pod instead. The falloff is
            soft rather than a hard cut so the edge never aliases as the tree
            sways. */
         float rr = length(vMapUv - 0.5) * 2.0;
         diffuseColor.a *= 1.0 - smoothstep(0.74, 1.0, rr);
       }`
    );
  };
  return m;
}

/* --------------------------------------------------------------- VIDEO
   "Random" is a shuffle of the pool, taken fresh on every load, so the four
   pods are not the same four clips every time. Each element still falls back
   to a local procedural loop if its URL fails, exactly as the hero does — the
   section must not go dark offline. */
const STOCK = (ASSETS.stock || []).slice();
const PLACE = ASSETS.placeholders || [];
const PLACE_DIR = ASSETS.placeholderDir || 'placeholders/';

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* The pool is the stock clips AND the local loops, so a shuffle actually has
   something to shuffle: four URLs across four pods would only ever permute the
   same four clips. Every entry here is known to load — two further Pexels ids
   were tried and both answered 403, which the per-element fallback swallowed
   silently while still costing a failed request on every load. */
const POOL = STOCK.concat(PLACE.map(n => PLACE_DIR + n));
const picks = shuffled(POOL);
const screens = PODS.map((_, i) => makeVideo(i));

function makeVideo(i) {
  /* one clip drawn from the shuffled pool, then a local loop as the offline floor */
  const sources = [picks[i % Math.max(picks.length, 1)], PLACE_DIR + PLACE[i % Math.max(PLACE.length, 1)]].filter(Boolean);
  let step = 0;

  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.preload = 'auto';
  v.loop = true; v.muted = true; v.playsInline = true; v.autoplay = true;
  v.setAttribute('webkit-playsinline', ''); v.setAttribute('playsinline', '');
  v.addEventListener('error', () => {
    if (step < sources.length - 1) { v.src = sources[++step]; try { v.load(); } catch (e) {} safePlay(); }
  });
  v.addEventListener('stalled', () => safePlay());
  v.src = sources[step];

  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { v, tex, mesh: null };
}
function safePlay() { screens.forEach(s => s.v.play().catch(() => {})); }

/* ----------------------------------------------------------------- TREE */
const treeGroup = new THREE.Group();
scene.add(treeGroup);

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
  ASSETS.model || 'assets-final/holographic-tree.glb',
  gltf => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());

    /* centre on the group's origin so the sway turns about the trunk */
    model.position.sub(centre);

    /* ---------------------------------------------------------- MATERIAL
       The same remap as the rig, and for the same measured reason: at
       metalness 0.965 a surface has no diffuse response, so it returns the
       environment rather than its own colour and no amount of light makes the
       basecolor show. Keep the map for its variation, scale the metalness down
       to a sheen and lift the roughness out of mirror territory. */
    const METALNESS_SCALE = 0.15;
    const ROUGH_FLOOR     = 0.42;
    const ROUGH_CEIL      = 0.90;

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    model.traverse(o => {
      if (!o.isMesh || !o.material) return;
      o.material.envMapIntensity = ENV_INTENSITY;
      o.material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
             roughnessFactor = mix(${ROUGH_FLOOR.toFixed(2)}, ${ROUGH_CEIL.toFixed(2)}, roughnessFactor);`)
          .replace('#include <metalnessmap_fragment>',
            `#include <metalnessmap_fragment>
             metalnessFactor *= ${METALNESS_SCALE.toFixed(2)};`);
      };
      o.material.customProgramCacheKey = () => 'tree-mr-remap';
      o.material.needsUpdate = true;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        if (o.material[k]) { o.material[k].anisotropy = maxAniso; o.material[k].needsUpdate = true; }
      }
    });

    treeGroup.add(model);

    /* --------------------------------------------------------- THE PODS
       PODS is in bounding-box fractions, so this is the one place the model's
       measured size turns them into positions. The planes are parented to the
       same group as the model, so the sway carries them with it and they can
       never drift off the pods. */
    PODS.forEach((pod, i) => {
      const geo = new THREE.PlaneGeometry(pod.w * size.x, pod.h * size.y);
      const mesh = new THREE.Mesh(geo, screenMaterial(screens[i].tex));
      mesh.position.set(
        box.min.x + pod.u * size.x - centre.x,
        box.min.y + pod.v * size.y - centre.y,
        box.min.z + pod.z * size.z - centre.z
      );
      /* The dishes face up and out, not straight at the camera. A flat +Z quad
         sits on them like a sticker; tilting it back onto the dish's own plane
         is what makes the video read as being INSIDE the pod. */
      mesh.rotation.x = pod.rx;
      treeGroup.add(mesh);
      screens[i].mesh = mesh;
    });

    /* ------------------------------------------------------------- FIT
       Framed by height, because the model is taller relative to the frame than
       it is wide: 0.980 / 0.721 = 1.36 against the frame's 1.628. */
    /* Visible height at distance d is 2*d*tan(fov/2); we want the model's height
       to be FIT_HEIGHT of that. The first pass multiplied by FIT_HEIGHT and then
       divided by it again, which cancels to a fit of exactly 1.0 — the tree
       filled the frame edge to edge with the trunk cut off top and bottom. */
    const dist = size.y / (2 * FIT_HEIGHT * Math.tan(THREE.MathUtils.degToRad(TREE_FOV / 2)));
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);

    console.log(`[tree] loaded ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}, ` +
                `camera at ${camera.position.z.toFixed(3)}, clips: ${picks.slice(0, 4).map(u => u.slice(-24)).join(', ')}`);

    renderer.compile(scene, camera);
    safePlay();
    const pre = document.getElementById('preloader2');
    if (pre) pre.style.display = 'none';
    document.body.classList.add('tree-in');
    ready = true;
  },
  undefined,
  err => {
    console.error('[tree] failed to load', ASSETS.model, err);
    const pre = document.getElementById('preloader2');
    if (pre) pre.style.display = 'none';
  }
);

/* -------------------------------------------------------------- RESIZE */
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h);
}
new ResizeObserver(resize).observe(container);
addEventListener('resize', resize);

/* ---------------------------------------------------------- RENDER LOOP
   Nothing is drawn until the model is in and nothing is drawn while the
   section is off screen — the hero is its own context and the two would
   otherwise both be running full tilt on the same GPU. */
let ready = false, visible = false;
new IntersectionObserver(e => {
  visible = e[0].isIntersecting;
  if (visible) safePlay(); else screens.forEach(s => s.v.pause());
}, { threshold: 0 }).observe(container);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  if (!ready || !visible || document.hidden) return;
  treeGroup.rotation.y = Math.sin(clock.getElapsedTime() * (Math.PI * 2 / SWAY_SECS)) * SWAY_RAD;
  /* Only upload a frame once the element actually has one. Without the guard
     three.js calls texImage2D on an empty <video> every frame until the first
     clip decodes, and the driver logs INVALID_VALUE for each one. */
  screens.forEach(s => { if (s.v.readyState >= 2) s.tex.needsUpdate = true; });
  renderer.render(scene, camera);
}
animate();

/* dev handles, same flag the hero uses */
if (new URLSearchParams(location.search).get('tune') === '1') {
  window.__tree = { THREE, scene, camera, renderer, treeGroup, screens, PODS };
  console.log('[tune] tree exposed as __tree');
}

}
