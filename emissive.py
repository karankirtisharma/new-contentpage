# Usage: python emissive.py in.glb out.glb <emissiveStrength>   (needs: pip install pygltflib numpy pillow)
# Derive an emissive map from the Tripo basecolor: green-dominant, bright-ish pixels = lit screens/panels.
import sys, io, numpy as np
from PIL import Image
from pygltflib import GLTF2, Texture, Image as GImage, TextureInfo, BufferView
src, dst = sys.argv[1], sys.argv[2]
g = GLTF2().load(src)
blob = bytearray(g.binary_blob())
im = g.images[0]; bv = g.bufferViews[im.bufferView]
base = Image.open(io.BytesIO(bytes(blob[bv.byteOffset:bv.byteOffset+bv.byteLength]))).convert('RGB')
a = np.asarray(base).astype(np.float32)/255.0
r,gg,b = a[...,0],a[...,1],a[...,2]
mx = a.max(-1); mn = a.min(-1); sat = (mx-mn)/(mx+1e-6)
val = mx
# green hue: G is max channel and clearly above R and B
green = ((gg - np.maximum(r,b)) > 0.07) & (val > 0.22)
# also include very bright near-white panels (paper/screens) softly
white = (val > 0.80) & (sat < 0.12)
mask = np.clip(green*1.0 + white*0.35, 0, 1)
# soften mask edges a bit
from PIL import ImageFilter
m = Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
mask = np.asarray(m).astype(np.float32)/255.0
tint = np.array([0.62,1.0,0.70],dtype=np.float32)  # pull pastel panels toward acid green
emis = (a * mask[...,None]) * tint
emis_img = Image.fromarray((np.clip(emis,0,1)*255).astype(np.uint8))
buf = io.BytesIO(); emis_img.save(buf, 'JPEG', quality=85); data = buf.getvalue()
print('mask coverage %', round(float((mask>0.5).mean()*100),2), 'emissive bytes', len(data))
# append to binary blob as new bufferView/image/texture
off = len(blob)
while off % 4: blob.append(0); off = len(blob)
blob.extend(data)
g.bufferViews.append(BufferView(buffer=0, byteOffset=off, byteLength=len(data)))
g.images.append(GImage(mimeType='image/jpeg', bufferView=len(g.bufferViews)-1, name='emissive_derived'))
g.textures.append(Texture(source=len(g.images)-1, sampler=g.textures[0].sampler))
mat = g.materials[0]
mat.emissiveTexture = TextureInfo(index=len(g.textures)-1)
mat.emissiveFactor = [1.0,1.0,1.0]
mat.extensions = mat.extensions or {}
mat.extensions['KHR_materials_emissive_strength'] = {'emissiveStrength': float(sys.argv[3]) if len(sys.argv)>3 else 3.0}
if 'KHR_materials_emissive_strength' not in (g.extensionsUsed or []):
    g.extensionsUsed = (g.extensionsUsed or []) + ['KHR_materials_emissive_strength']
g.set_binary_blob(bytes(blob))
g.buffers[0].byteLength = len(blob)
g.save(dst)
print('saved', dst)
