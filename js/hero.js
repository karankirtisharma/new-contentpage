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
const ENV_INTENSITY = 15.0;
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
    rigBody.position.y = CEILING_Y - size.y / 2; /* bbox top -> exactly CEILING_Y */

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    let glbMesh = null;
    model.traverse(o => {
      if (!o.isMesh || !o.material) return;
      o.material.envMapIntensity = ENV_INTENSITY;
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
    const worldTop = new THREE.Box3().setFromObject(model).max.y;
    const gap = worldTop - CEILING_Y;
    console.log(`[hero] model bbox.max.y = ${worldTop.toFixed(6)}  CEILING_Y = ${CEILING_Y.toFixed(6)}  gap = ${gap.toFixed(6)}`);
    if (Math.abs(gap) > 1e-4) console.error('[hero] ceiling gap is not zero:', gap);
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
   Bloom is pulled back hard as well — strength 0.8 -> 0.45, radius 0.6 -> 0.18,
   threshold 0.2 -> 0.72. At threshold 0.2 almost every lit surface bloomed and
   smeared; at 0.85 the machine went black. 0.72 blooms the highlights only, so
   edges stay edges and screen text stays readable. Its buffer is sized in
   device pixels to match the real pixel ratio. */
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(container.clientWidth * heroPixelRatio(), container.clientHeight * heroPixelRatio()),
  0.45,   /* strength  — was 0.8  */
  0.18,   /* radius    — was 0.6, tight so it never softens an edge */
  0.72);  /* threshold — was 0.2; only genuine highlights bloom now */
composer.addPass(bloomPass);
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
   Dev inspection only, ?tune=1. There is nothing left to nudge — the screens
   are geometry cut from the GLB's own display faces, so their placement is not
   adjustable by transform any more. This just exposes the handles.
   Nothing below runs unless the flag is present. */
if (TUNE) {
  window.__screens = screens;
  window.__rig = rig;
  window.__rigBody = rigBody;
  window.__cam = camera;
  window.__controls = controls;
  window.__renderer = renderer;
  window.__film = filmPass;      /* .enabled = false to preview with no grain */
  window.__bloom = bloomPass;
  console.log('[tune] on — __screens/__rig/__rigBody/__cam/__controls/__renderer/__film/__bloom');
}
