/* Step 1 — textures only. MUST NOT import @gltf-transform/functions: importing it
 * pulls in ndarray-pixels, which initialises libvips such that every subsequent
 * sharp encode dies with "colourspace: parameter space not set" on this Windows
 * build. Geometry is handled in a separate process (step2-geometry.mjs).
 *
 * node step1-textures.mjs <in.glb> <out.glb> <baseSize> <normalSize> <mrSize>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const [inPath, outPath, baseS, normS, mrS] = process.argv.slice(2);
const SIZES = { base: +baseS, normal: +normS, mr: +mrS };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const root = doc.getRoot();

function slotOf(tex) {
  for (const m of root.listMaterials()) {
    if (m.getBaseColorTexture() === tex) return 'base';
    if (m.getNormalTexture() === tex) return 'normal';
    if (m.getMetallicRoughnessTexture() === tex) return 'mr';
  }
  return 'base';
}

const report = [];
for (const tex of root.listTextures()) {
  const slot = slotOf(tex);
  const size = SIZES[slot];
  const src = Buffer.from(tex.getImage());
  const meta = await sharp(src, { limitInputPixels: false }).metadata();
  /* normal map keeps the highest quality — webp chroma loss shows up as facet
     banding in the tangent basis; basecolor and metallic-roughness tolerate more. */
  const q = slot === 'normal' ? 92 : slot === 'base' ? 86 : 82;
  const out = await sharp(src, { limitInputPixels: false })
    .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    .webp({ quality: q, effort: 6 })
    .toBuffer();
  tex.setImage(new Uint8Array(out)).setMimeType('image/webp').setURI('');
  report.push({ slot, from: `${meta.width}x${meta.height}`, to: `${size}x${size}`,
    fromMB: +(src.length / 1048576).toFixed(3), toMB: +(out.length / 1048576).toFixed(3), quality: q });
}

await io.write(outPath, doc);
console.log(JSON.stringify({ step: 'textures', outMB: +(statSync(outPath).size / 1048576).toFixed(2), report }, null, 1));
