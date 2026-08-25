/* =====================================================================
   SECTION 3 — the neon screen display.

   Third Tripo export in the set, and the first one whose screens are real
   geometry. Measured on the source before anything was built:

     bbox            0.983 x 0.486 x 0.984  — a round stage, seen from outside
     triangles       1,824,519
     MR metalness    0.694 mean / 0.769 median
     MR roughness    0.159 mean / 0.067 median
     basecolor       mean sRGB 0.074, 0.151, 0.043

   The MR map is the same shape of problem as the rig's and the tree's but
   milder — 0.769 median against their 0.96 — so the remap is gentler here.

   What makes this one different: it HAS flat display faces. Clustering every
   triangle by normal and plane offset over the source turns up six large
   coplanar faces, all at y ~0.18 on a circle of radius ~0.42:

     ( 0.000, 0.179,  0.417)  n ( 0.00, 0.00,  1.00)  area 0.0380
     ( 0.000, 0.180, -0.417)  n ( 0.00, 0.00, -1.00)  area 0.0376
     ( 0.400, 0.180,  0.132)  n ( 0.93, 0.00,  0.36)  area 0.0366
     (-0.400, 0.180, -0.132)  n (-0.93,-0.02, -0.36)  area 0.0363
     (-0.400, 0.180,  0.133)  n (-0.95, 0.00,  0.31)  area 0.0363
     ( 0.399, 0.181, -0.134)  n ( 0.94,-0.03, -0.35)  area 0.0361

   So the video here is CUT FROM the mesh, the way the hero's screens are, not
   placed the way the tree's had to be — the panels are their own flat faces and
   the footage cannot sit crooked or spill past a bezel.

   The six faces each have a twin about 0.09 behind them, facing inward, of
   almost the same area (0.0334, 0.0332). Picking the six largest would happen
   to get it right on this asset and would be luck; the filter below requires
   the normal to point away from the axis instead.
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const ASSETS = window.NEON_ASSETS || {};
const container = document.getElementById('scene3d3');
if (container) init();

function init() {

/* ------------------------------------------------------ FACE EXTRACTION */
const FACE_MAX_TILT   = 0.35;   /* |normal.y| — a display face stands up */
const FACE_MIN_RADIUS = 0.25;   /* excludes the stage floor and the mast   */
const FACE_MIN_AREA   = 0.020;  /* the six real faces are all above 0.036  */
const FACE_TRIM       = 0.01;   /* percentile trimmed off each in-plane edge */
const MAX_FACES       = 6;
const VIDEO_ASPECT    = 16 / 9;
/* Same 14% as the hero: one clip in the shared pool carries a bright gradient
   baked across the top of its frame, and the grade lifts it into the ramp's
   top tiers. See DECISIONS 7.14. */
const SCREEN_TOP_CROP = 0.14;

/* The model is framed to this fraction of the frame's width — but measured
   against the stage's CENTRE, and the stage's near edge sits 0.49 closer to the
   camera than that. At 0.92 the near rim was half again as large as the fit
   assumed and spilled off the bottom of the frame while the canopy left the
   top. Framing the centre at 0.72 leaves the near edge room to be nearer. */
const FIT_WIDTH  = 0.72;
const NEON_FOV   = 32;
const SPIN_RATE  = Math.PI * 2 * 0.4 / 60;   /* rad/s — the stage turns, slowly */

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(NEON_FOV, container.clientWidth / container.clientHeight, 0.01, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false });
renderer.setClearColor(0x000000, 0);
const DPR_CAP = 2;
const pixelRatio = () => Math.min((window.devicePixelRatio || 1) * (window.__SCALE || 1), DPR_CAP);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

/* ---------------------------------------------------------------- LIGHTS
   White studio, same rule as the other two sections: nothing tints, the hue
   is the model's own basecolor. Ambient is low for the same reason it is low
   on the tree — this basecolor is dark with bright filaments, and lifting the
   floor lifts the dark far more than the filaments. */
const WHITE = 0xffffff;
scene.add(new THREE.AmbientLight(WHITE, 0.30));

/* Side-on rather than overhead. The stage is a wide disc facing straight up, so
   a key with much height in it lands square on the floor and burns it to a pale
   grey slab — which is what the first pass did, with the floor reading brighter
   than the screens. Dropping the key's elevation puts the light on the panels
   and leaves the floor to catch a grazing sheen. */
const keyLight = new THREE.DirectionalLight(WHITE, 1.9);
keyLight.position.set(-2.2, 0.85, 2.2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(WHITE, 0.7);
fillLight.position.set(2.4, 0.5, 1.4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(WHITE, 1.4);
rimLight.position.set(0.2, 0.9, -2.6);   /* low, for the same reason the key is */
scene.add(rimLight);

/* -------------------------------------------------------- ENVIRONMENT
   Dimmer, and with a darker sky than the other two sections use. This model is
   mostly a pair of wide horizontal discs facing straight up, and an up-facing
   surface reflects the environment's upper hemisphere across its whole area —
   so a bright sky lands on the stage as a pale grey slab and reads brighter
   than the screens standing on it. The panels barely notice the difference:
   they are vertical, and take their light from the key. */
const ENV_INTENSITY = 0.55;
{
  const envScene = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(8, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uLo: { value: new THREE.Color(0x16191c) }, uHi: { value: new THREE.Color(0x7c848c) } },
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

/* These are bare panels facing the camera, not behind pod glass like the
   tree's, so they need less gain than that section's 0.95. */
const SCREEN_GAIN = { value: 0.78 };
const uGrade = { value: ASSETS.screenGrade ?? 1 };

function screenMaterial(tex) {
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false, fog: false });
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
       }`
    );
  };
  return m;
}

/* --------------------------------------------------------------- VIDEO */
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
/* stock plus the local loops, so a shuffle over six panels has more than four
   things to draw from */
const picks = shuffled(STOCK.concat(PLACE.map(n => PLACE_DIR + n)));
const screens = [];

function makeVideo(i) {
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

/* ------------------------------------------------------ FACE EXTRACTION
   Group every triangle by its geometric normal and its distance along that
   normal, so a flat face lands in one bucket however many triangles it is made
   of. Then keep the buckets that look like a display: standing up, out on the
   ring, facing away from the axis, and big.

   The outward test is what separates a panel's front from its back — every one
   of these panels has a twin face ~0.09 behind it, facing inward, of nearly the
   same area, so sorting by area alone would be a coin toss. */
function extractFaces(mesh) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
  const triCount = (idx ? idx.count : pos.count) / 3;
  const vi = i => (idx ? idx.getX(i) : i);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const buckets = new Map();

  for (let t = 0; t < triCount; t++) {
    const i0 = vi(t * 3), i1 = vi(t * 3 + 1), i2 = vi(t * 3 + 2);
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
    const len = n.length();
    if (len < 1e-12) continue;
    n.divideScalar(len);
    if (Math.abs(n.y) > FACE_MAX_TILT) continue;

    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
    if (Math.hypot(cx, cz) < FACE_MIN_RADIUS) continue;
    if (n.x * cx + n.z * cz <= 0) continue;             /* must face away from the axis */

    const d = n.x * cx + n.y * cy + n.z * cz;
    const key = `${Math.round(n.x * 12)},${Math.round(n.y * 12)},${Math.round(n.z * 12)},${Math.round(d * 24)}`;
    let e = buckets.get(key);
    if (!e) { e = { tris: [], area: 0, nx: 0, ny: 0, nz: 0 }; buckets.set(key, e); }
    e.tris.push(i0, i1, i2);
    e.area += len / 2;
    e.nx += n.x * len; e.ny += n.y * len; e.nz += n.z * len;
  }

  const kept = [...buckets.values()].filter(e => e.area >= FACE_MIN_AREA)
    .sort((x, y) => y.area - x.area).slice(0, MAX_FACES);

  const tmp = new THREE.Vector3();
  return kept.map(e => {
    const nrm = new THREE.Vector3(e.nx, e.ny, e.nz).normalize();
    /* in-plane basis: v is up flattened onto the face, u completes the pair */
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(nrm, -nrm.y).normalize();
    const right = new THREE.Vector3().crossVectors(up, nrm).normalize();

    /* percentile trim before anything else — a few stray triangles at the same
       depth but off to one side stretch the extent the UVs normalise against,
       which shifts and shrinks the video across the whole panel */
    const cu = [], cv = [];
    for (let i = 0; i < e.tris.length; i += 3) {
      tmp.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        const q = new THREE.Vector3().fromBufferAttribute(pos, e.tris[i + k]);
        tmp.add(q);
      }
      tmp.multiplyScalar(1 / 3);
      cu.push(tmp.dot(right)); cv.push(tmp.dot(up));
    }
    const pct = (arr, f) => { const s = arr.slice().sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))]; };
    const uLo = pct(cu, FACE_TRIM), uHi = pct(cu, 1 - FACE_TRIM);
    const vLo = pct(cv, FACE_TRIM), vHi = pct(cv, 1 - FACE_TRIM);
    const padU = (uHi - uLo) * 0.06, padV = (vHi - vLo) * 0.06;

    const keepTris = [];
    for (let i = 0, k = 0; i < e.tris.length; i += 3, k++) {
      if (cu[k] >= uLo - padU && cu[k] <= uHi + padU && cv[k] >= vLo - padV && cv[k] <= vHi + padV) {
        keepTris.push(e.tris[i], e.tris[i + 1], e.tris[i + 2]);
      }
    }
    if (keepTris.length < 9) return null;

    const P = new Float32Array(keepTris.length * 3);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < keepTris.length; i++) {
      tmp.fromBufferAttribute(pos, keepTris[i]);
      P[i * 3] = tmp.x; P[i * 3 + 1] = tmp.y; P[i * 3 + 2] = tmp.z;
      const du = tmp.dot(right), dv = tmp.dot(up);
      if (du < u0) u0 = du; if (du > u1) u1 = du;
      if (dv < v0) v0 = dv; if (dv > v1) v1 = dv;
    }
    const w = u1 - u0, h = v1 - v0;
    if (w <= 0 || h <= 0) return null;

    /* cover-fit, then the top crop — identical to the hero's, both axes scaled
       by the same factor so nothing stretches */
    const faceAspect = w / h;
    const sx = faceAspect < VIDEO_ASPECT ? faceAspect / VIDEO_ASPECT : 1;
    const sy = faceAspect < VIDEO_ASPECT ? 1 : VIDEO_ASPECT / faceAspect;
    const zoom = 1 - SCREEN_TOP_CROP;
    const vMid = 0.5 - SCREEN_TOP_CROP / 2;

    const UV = new Float32Array(keepTris.length * 2);
    for (let i = 0; i < keepTris.length; i++) {
      tmp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      UV[i * 2]     = 0.5  + ((tmp.dot(right) - u0) / w - 0.5) * sx * zoom;
      UV[i * 2 + 1] = vMid + ((tmp.dot(up)    - v0) / h - 0.5) * sy * zoom;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    g.computeBoundingSphere();
    return { geometry: g, tris: keepTris.length / 3, size: [w, h], area: e.area };
  }).filter(Boolean);
}

/* ------------------------------------------------------------- THE RIG */
const rig = new THREE.Group();
scene.add(rig);
let ready = false;

new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
  ASSETS.model || 'assets-final/neon-screens.glb',
  gltf => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());

    /* centred on X/Z so the stage turns about its own axis; Y is left alone so
       the floor stays the floor */
    model.position.x -= centre.x;
    model.position.z -= centre.z;
    model.updateMatrixWorld(true);

    /* ---------------------------------------------------------- MATERIAL
       Milder than the other two — this map starts at metalness 0.769 rather
       than 0.965 — so the metalness is scaled less hard. The roughness lift is
       the same: 0.067 median is still a mirror. */
    const METALNESS_SCALE = 0.25;
    const ROUGH_FLOOR     = 0.40;
    const ROUGH_CEIL      = 0.88;

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    let big = null;
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
      o.material.customProgramCacheKey = () => 'neon-mr-remap';
      o.material.needsUpdate = true;
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        if (o.material[k]) { o.material[k].anisotropy = maxAniso; o.material[k].needsUpdate = true; }
      }
      if (!big || o.geometry.attributes.position.count > big.geometry.attributes.position.count) big = o;
    });

    rig.add(model);

    /* the display surfaces, cut from the panels' own faces */
    if (big) {
      const faces = extractFaces(big);
      faces.forEach((f, i) => {
        screens.push(makeVideo(i));
        const m = new THREE.Mesh(f.geometry, screenMaterial(screens[i].tex));
        /* coplanar with the face it came from — offset in depth, not in space */
        m.material.polygonOffset = true;
        m.material.polygonOffsetFactor = -2;
        m.material.polygonOffsetUnits = -2;
        big.add(m);
        screens[i].mesh = m;
      });
      console.log('[neon] faces:', faces.length ? faces.map((f, i) =>
        `p${i + 1} ${f.tris}t ${f.size[0].toFixed(3)}x${f.size[1].toFixed(3)}`).join(' | ') : 'NONE FOUND');
    }

    /* ------------------------------------------------------------- FIT
       Framed by width: the stage is 0.983 across and only 0.486 tall, so width
       is what runs out first. */
    const dist = (size.x / FIT_WIDTH) / (2 * Math.tan(THREE.MathUtils.degToRad(NEON_FOV / 2)) * camera.aspect);
    camera.position.set(0, box.min.y + size.y * 0.78, dist);
    camera.lookAt(0, box.min.y + size.y * 0.42, 0);

    console.log(`[neon] ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}, camera z ${dist.toFixed(3)}`);

    renderer.compile(scene, camera);
    safePlay();
    const pre = document.getElementById('preloader3');
    if (pre) pre.style.display = 'none';
    document.body.classList.add('neon-in');
    ready = true;
  },
  undefined,
  err => {
    console.error('[neon] failed to load', ASSETS.model, err);
    const pre = document.getElementById('preloader3');
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

/* ---------------------------------------------------------- RENDER LOOP */
let visible = false;
new IntersectionObserver(e => {
  visible = e[0].isIntersecting;
  if (visible) safePlay(); else screens.forEach(s => s.v.pause());
}, { threshold: 0 }).observe(container);

let prev = 0;
function animate(now) {
  requestAnimationFrame(animate);
  if (!ready || !visible || document.hidden) { prev = now; return; }
  const dt = Math.min((now - prev) / 1000, 0.05); prev = now;
  /* the stage turns, so every panel comes round to the front in time */
  rig.rotation.y += SPIN_RATE * dt;
  screens.forEach(s => { if (s.v.readyState >= 2) s.tex.needsUpdate = true; });
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

if (new URLSearchParams(location.search).get('tune') === '1') {
  window.__neon = { THREE, scene, camera, renderer, rig, screens };
  console.log('[tune] neon exposed as __neon');
}

}
