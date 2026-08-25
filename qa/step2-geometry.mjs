/* Step 2 — geometry only. Never imports sharp (see step1-textures.mjs for why
 * the two steps are separate processes). prune() keeps solid textures because
 * that check reads texture pixels, which is the same poisoned code path.
 *
 * node step2-geometry.mjs <in.glb> <out.glb> <ratio> <error>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, flatten, join, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const [inPath, outPath, ratioS, errorS] = process.argv.slice(2);
const RATIO = +ratioS, ERROR = +errorS;

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptEncoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(inPath);
const root = doc.getRoot();

const tris = () => root.listMeshes().reduce((n, m) =>
  n + m.listPrimitives().reduce((k, p) =>
    k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);

const before = tris();

await doc.transform(
  dedup(),
  flatten(),
  join(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: ERROR }),
  prune({ keepAttributes: false, keepSolidTextures: true }),
);

const after = tris();

/* meshopt over Draco: decoder is already reachable through the existing
   three/addons/ import-map prefix, and it decodes an order of magnitude faster. */
doc.createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await doc.transform(quantize());

await io.write(outPath, doc);

console.log(JSON.stringify({
  step: 'geometry', ratio: RATIO, error: ERROR,
  trisBefore: Math.round(before), trisAfter: Math.round(after),
  kept: (100 * after / before).toFixed(1) + '%',
  outMB: +(statSync(outPath).size / 1048576).toFixed(2),
}, null, 1));
