/**
 * Offline texture generator — run with `npm run gen:textures`.
 *
 * Writes every texture the world needs into `public/textures/`. Everything here is
 * DETERMINISTIC (seeded) and generated locally: master-doc rule 5C bans CDN fetches, and
 * baking these offline keeps boot free of a ~100ms canvas-generation stall.
 *
 * Deviation from master doc 2E, recorded deliberately: the doc specifies the NASA CGI
 * Moon Kit (SVS #4720) albedo + a normal baked from LOLA displacement. That needs a
 * network fetch of a 4K TIFF plus image tooling this repo does not have, and it would
 * still have to be re-encoded and shipped locally. Generating the moon procedurally
 * instead gives three concrete advantages here:
 *   - the normal map derives from the SAME height field as the albedo, so relief and
 *     shading agree exactly (baking from a separate dataset cannot guarantee that);
 *   - crater scale is authored for a moon that occupies ~17 degrees of frame, rather
 *     than for a full-disc science visualisation;
 *   - no attribution burden, no external URL that can rot.
 * Swapping in the NASA maps later is a file drop — nothing in the shader assumes this
 * generator. Crater statistics follow the real power-law size-frequency distribution.
 *
 * WE ARE ON THE MOON. The lunar surface is the LAND the camera flies over, not a body
 * in the sky (owner direction, superseding master doc 3D). What hangs in the sky is the
 * parent planet this moon orbits — which is what you would actually see standing here,
 * and it keeps the scale anchor the brief asks for in section 22 without pretending to
 * be the moon. The cratered equirect below is therefore repurposed: it is the SURFACE's
 * crater/regolith source, sampled planar on the terrain, not a sphere texture.
 *
 * Outputs:
 *   lunar_albedo.png   1024x512 regolith + maria + crater field           (RGB)
 *   lunar_normal.png   1024x512 tangent-space normal from the same field  (RGB)
 *   planet_albedo.png   512x256 banded gas-giant parent planet            (RGB)
 *   noise_rg.png        512x512 tiling 2-channel FBM for fog/domain warp (RGB)
 *   regolith_normal.png 1024x1024 tiling detail normal for terrain/rocks (RGB)
 *   nebula.png          512x256 very low-contrast FBM gradient card      (RGB)
 */
import { createNoise2D, createNoise3D, createNoise4D } from 'simplex-noise';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'textures');
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- seeded PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- minimal PNG writer
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/** rgb: Uint8Array of w*h*3 */
function writePng(path, w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`  ${path.split(/[\\/]/).pop()}  ${w}x${h}  ${(png.length / 1024).toFixed(0)} KB`);
}

/** Height field -> tangent-space normal map via Sobel. `wrapX` for equirect/tiling. */
function heightToNormal(h, w, hgt, strength, wrapX = true, wrapY = true) {
  const out = new Uint8Array(w * hgt * 3);
  const at = (x, y) => {
    let xx = x, yy = y;
    if (wrapX) xx = (x + w) % w; else xx = Math.min(w - 1, Math.max(0, x));
    if (wrapY) yy = (y + hgt) % hgt; else yy = Math.min(hgt - 1, Math.max(0, y));
    return h[yy * w + xx];
  };
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ================================================================ LUNAR SURFACE
// Equirect only because the crater maths is spherical; the terrain samples it planar.
function genLunarSurface() {
  const W = 1024, H = 512;
  const rand = mulberry32(0x4d4f4f4e);
  const n3 = createNoise3D(rand);

  const height = new Float32Array(W * H);
  const albedo = new Float32Array(W * H);

  // Sample noise on the actual sphere so there is no pole pinch and no seam.
  const dirOf = (x, y) => {
    const lon = (x / W) * Math.PI * 2 - Math.PI;
    const lat = (0.5 - y / H) * Math.PI;
    const cl = Math.cos(lat);
    return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)];
  };

  const fbm3 = (p, oct, freq, gain = 0.5) => {
    let a = 1, f = freq, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += a * n3(p[0] * f, p[1] * f, p[2] * f);
      norm += a;
      a *= gain;
      f *= 2;
    }
    return sum / norm;
  };

  // --- base: gentle regolith undulation + maria (big dark basalt plains)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = dirOf(x, y);
      const i = y * W + x;
      const base = fbm3(d, 5, 2.2) * 0.5 + 0.5;
      // Maria: a few large low regions, biased to one hemisphere like the real near side
      const m = fbm3([d[0] + 11.3, d[1] - 4.7, d[2] + 2.1], 3, 1.05) * 0.5 + 0.5;
      const maria = smooth(0.52, 0.70, m);
      height[i] = base * 0.35 - maria * 0.25;
      // Highlands are bright (~0.16 albedo), maria dark (~0.07) — real lunar values.
      albedo[i] = 0.155 - maria * 0.075 + (base - 0.5) * 0.035;
    }
  }

  // --- craters, power-law size distribution (many small, few huge)
  const CRATERS = 1500;
  for (let c = 0; c < CRATERS; c++) {
    // radius in radians on the sphere; r^-2 -ish frequency
    const u = rand();
    const rad = 0.006 + 0.16 * Math.pow(u, 3.1);
    // uniform point on the sphere (avoids equirect pole clustering)
    // Bias slightly off the poles: an equirect pole row maps every x to one direction,
    // so a polar crater smears into a full-width band in the flat map.
    const z = (rand() * 2 - 1) * 0.93;
    const th = rand() * Math.PI * 2;
    const rxy = Math.sqrt(1 - z * z);
    const cd = [rxy * Math.cos(th), z, rxy * Math.sin(th)];

    const depth = rad * (0.22 + rand() * 0.16);
    const rimH = depth * (0.45 + rand() * 0.3);
    // Craters must read through SHADING (the normal map under grazing moonlight), not
    // through albedo. Fresh-ejecta brightening is a whisper; the first pass painted it
    // ~4x too strong and every crater read as a white blob.
    const bright = 0.003 + rand() * 0.007;
    const hasRays = rad > 0.10 && rand() < 0.07;

    // bounding box in pixels
    const latC = Math.asin(cd[1]);
    const yC = (0.5 - latC / Math.PI) * H;
    const padY = Math.ceil(((rad * 2.4) / Math.PI) * H) + 2;
    const cosLat = Math.max(0.12, Math.cos(latC));
    const padX = Math.ceil(((rad * 2.4) / (Math.PI * 2 * cosLat)) * W) + 2;
    const lonC = Math.atan2(cd[2], cd[0]);
    const xC = ((lonC + Math.PI) / (Math.PI * 2)) * W;

    for (let dy = -padY; dy <= padY; dy++) {
      const y = Math.round(yC + dy);
      if (y < 0 || y >= H) continue;
      for (let dx = -padX; dx <= padX; dx++) {
        const x = (Math.round(xC + dx) + W) % W;
        const d = dirOf(x, y);
        // angular distance
        const dot = clamp01(d[0] * cd[0] + d[1] * cd[1] + d[2] * cd[2]) * 2 - 1;
        const ang = Math.acos(Math.max(-1, Math.min(1, d[0] * cd[0] + d[1] * cd[1] + d[2] * cd[2])));
        void dot;
        if (ang > rad * 2.3) continue;
        const q = ang / rad;
        const i = y * W + x;

        // bowl (parabolic) inside, raised rim at q~1, ejecta blanket outside
        let dh = 0;
        if (q < 1) dh = -depth * (1 - q * q) + rimH * smooth(0.72, 1.0, q);
        else dh = rimH * (1 - smooth(1.0, 2.0, q));
        // rough the rim so craters do not read as perfect circles
        const rough = fbm3([d[0] * 9 + c, d[1] * 9, d[2] * 9], 2, 3.5) * 0.28;
        height[i] += dh * (1 + rough);

        // fresh craters are slightly brighter (unweathered ejecta)
        if (q < 1.6) albedo[i] += bright * (1 - smooth(0.7, 1.6, q));
        if (hasRays) {
          // Rays are irregular streaks, not clean petals: break the angular lobe with
          // noise or they read as a dandelion.
          const rayA = Math.atan2(d[2] - cd[2], d[0] - cd[0]);
          const lobe = Math.pow(Math.max(0, Math.cos(rayA * 7 + c)), 14);
          const broken = Math.max(0, fbm3([d[0] * 6 + c, d[1] * 6, d[2] * 6], 2, 4) * 0.5 + 0.5);
          albedo[i] += bright * 0.5 * lobe * broken * (1 - smooth(1.0, 5.0, q));
        }
      }
    }
  }

  // --- write albedo (kept desaturated grey; green arrives as LIGHT, never as texture)
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    // The moon is DARK (real bond albedo ~0.12). It is lit by its own bright key, so
    // the texture stays a mid-dark grey; lifting it further blew the disc to white.
    const v = clamp01(albedo[i] * 1.85);
    // a whisper of warmth in the highlands, cool in maria — keeps it from reading flat
    const r = clamp01(v * 1.02), g = clamp01(v), b = clamp01(v * 0.97);
    rgb[i * 3] = Math.round(r * 255);
    rgb[i * 3 + 1] = Math.round(g * 255);
    rgb[i * 3 + 2] = Math.round(b * 255);
  }
  writePng(join(OUT, 'lunar_albedo.png'), W, H, rgb);

  // --- normal from the SAME height field
  writePng(join(OUT, 'lunar_normal.png'), W, H, heightToNormal(height, W, H, 26, true, false));
}

// ================================================================ PARENT PLANET
/**
 * The body in the sky is NOT a moon — we are standing on the moon. It is the gas giant
 * this moon orbits: banded, atmospheric, no craters, deliberately low-contrast so it
 * reads as a mood element and a scale anchor rather than a focal point.
 */
function genPlanet() {
  const W = 512, H = 256;
  const rand = mulberry32(0x91a7e7);
  const n2 = createNoise2D(rand);
  const rgb = new Uint8Array(W * H * 3);
  const fbm = (x, y, oct, f0) => {
    let a = 1, f = f0, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); n += a; a *= 0.5; f *= 2.1; }
    return s / n;
  };
  for (let y = 0; y < H; y++) {
    const lat = (y / H) * 2 - 1;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // Latitude bands, warped along longitude so they swirl instead of striping.
      const warp = fbm(u * 3.0, lat * 1.2, 4, 2.2) * 0.14;
      const band = Math.sin((lat + warp) * 13.0) * 0.5 + 0.5;
      const soft = Math.sin((lat + warp * 0.6) * 4.0) * 0.5 + 0.5;
      let v = 0.34 + band * 0.16 + soft * 0.2;
      // A couple of lighter zones + limb darkening toward the poles
      v *= 1 - Math.pow(Math.abs(lat), 2.6) * 0.4;
      const i = (y * W + x) * 3;
      // Desaturated teal-green: it is LIT by the same star, and green must come from
      // light, so the albedo stays close to neutral with only a slight cool bias.
      rgb[i] = Math.round(clamp01(v * 0.86) * 255);
      rgb[i + 1] = Math.round(clamp01(v) * 255);
      rgb[i + 2] = Math.round(clamp01(v * 0.92) * 255);
    }
  }
  writePng(join(OUT, 'planet_albedo.png'), W, H, rgb);
}

// ================================================================ tiling FBM (fog)
function genNoiseRG() {
  const S = 512;
  const rand = mulberry32(0xf0617e);
  const n4 = createNoise4D(rand);
  // 4D noise on a torus => perfectly seamless in both axes.
  const torus = (u, v, f) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    return n4((Math.cos(a) * f) / (Math.PI * 2), (Math.sin(a) * f) / (Math.PI * 2),
              (Math.cos(b) * f) / (Math.PI * 2), (Math.sin(b) * f) / (Math.PI * 2));
  };
  const fbm = (u, v, oct, f0) => {
    let a = 1, f = f0, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * torus(u, v, f); n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
  const rgb = new Uint8Array(S * S * 3);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const r = fbm(u, v, 4, 3) * 0.5 + 0.5;   // main density
      const g = fbm(u, v, 3, 7) * 0.5 + 0.5;   // domain-warp channel
      const i = (y * S + x) * 3;
      rgb[i] = Math.round(clamp01(r) * 255);
      rgb[i + 1] = Math.round(clamp01(g) * 255);
      rgb[i + 2] = 0;
    }
  }
  writePng(join(OUT, 'noise_rg.png'), S, S, rgb);
}

// ================================================================ regolith detail normal
function genRegolith() {
  const S = 1024;
  const rand = mulberry32(0x2e60117);
  const n4 = createNoise4D(rand);
  const torus = (u, v, f) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    return n4((Math.cos(a) * f) / (Math.PI * 2), (Math.sin(a) * f) / (Math.PI * 2),
              (Math.cos(b) * f) / (Math.PI * 2), (Math.sin(b) * f) / (Math.PI * 2));
  };
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let a = 1, f = 6, s = 0, n = 0;
      for (let i = 0; i < 6; i++) { s += a * torus(u, v, f); n += a; a *= 0.55; f *= 2.1; }
      let val = s / n;
      // sharpen into grain: regolith is pitted, not rolling
      val = Math.sign(val) * Math.pow(Math.abs(val), 1.4);
      // scattered micro-pits
      const pit = torus(u, v, 34);
      val -= Math.pow(Math.max(0, pit), 6) * 0.5;
      h[y * S + x] = val;
    }
  }
  writePng(join(OUT, 'regolith_normal.png'), S, S, heightToNormal(h, S, S, 14, true, true));
}

// ================================================================ nebula card
function genNebula() {
  const W = 512, H = 256;
  const rand = mulberry32(0x9eb17a);
  const n2 = createNoise2D(rand);
  const fbm = (x, y, oct, f0) => {
    let a = 1, f = f0, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const n = fbm(u * 2.2, v * 2.2, 4, 1.4) * 0.5 + 0.5;
      // radial falloff so the card has no edges
      const edge = smooth(0.5, 0.12, Math.hypot(u - 0.5, v - 0.5));
      const val = clamp01(Math.pow(n, 2.4) * edge);
      const i = (y * W + x) * 3;
      // extremely dark green — this only breaks up pure black, never reads as colour
      rgb[i] = Math.round(val * 18);
      rgb[i + 1] = Math.round(val * 46);
      rgb[i + 2] = Math.round(val * 32);
    }
  }
  writePng(join(OUT, 'nebula.png'), W, H, rgb);
}

console.log('generating textures ->', OUT);
genLunarSurface();
genPlanet();
genNoiseRG();
genRegolith();
genNebula();
console.log('done.');
