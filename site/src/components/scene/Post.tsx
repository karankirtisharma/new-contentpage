'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  BrightnessContrast,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { wrapEffect } from '@react-three/postprocessing';
import { BlendFunction, Effect, SMAAPreset, ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { scroll } from '@/lib/store';
import type { TierConfig } from '@/lib/tier';

/**
 * THE POST CHAIN — master doc 2F / 5A, and the pipeline inversion of Trap #15.
 *
 * THE INVERSION, AND WHY IT IS THE POINT. The renderer now tone-maps NOTHING
 * (`NoToneMapping`, set on the Canvas as `flat`), the composer's buffers are HalfFloat,
 * and tone mapping happens ONCE at the end of the chain as an AgX pass. Previously every
 * colour was squashed into [0,1] before the first effect ran, which meant the scene had
 * no HDR range for bloom to find: a "bright" emissive and a lit wall arrived at the bloom
 * pass as the same number, so the threshold had to be dropped to 0.85 and bloom smeared
 * over ordinary surfaces. It made light rather than revealing it.
 *
 * With HDR buffers the threshold can sit at 1.0 and mean something: only pixels that are
 * genuinely brighter than diffuse white bloom — the emissive panels, the moon's limb, the
 * hottest speculars. That is selective bloom for free, without SelectiveBloomEffect's
 * second scene render.
 *
 * AgX rather than ACES or Neutral. ACESFilmic skews saturated greens toward yellow as
 * they approach clip — the "notorious six" — which would turn every emerald source
 * acid-yellow at exactly the moment it is supposed to read as emerald. Neutral crushes
 * shadow detail, and this scene is mostly shadow. AgX holds the hue and desaturates
 * gracefully; its characteristic flatness is put back by the grade AFTER it.
 *
 * TRAP #15 CONSEQUENCE: `toneMapped: false` is now a no-op everywhere, because the
 * renderer no longer tone-maps at all. Materials that relied on it — the dust layers, the
 * fog cards, the ridges, the monitor screens — are no longer exempt from anything; they
 * are simply linear values that now pass through AgX like everything else. Their levels
 * were recalibrated in this same phase rather than piecemeal.
 */

// ---------------------------------------------------------------- pre-exposure

const exposureFrag = /* glsl */ `
  uniform float uExposure;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    outputColor = vec4(inputColor.rgb * uExposure, inputColor.a);
  }
`;

/**
 * A multiply, before tone mapping, driven by the beat table's `exposure` channel.
 *
 * It has to sit BEFORE AgX to behave like a camera stop: scaling scene radiance and
 * letting the transfer curve respond. `renderer.toneMappingExposure` would have been the
 * obvious home for it, and is a no-op under NoToneMapping.
 */
class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', exposureFrag, {
      uniforms: new Map([['uExposure', new THREE.Uniform(1)]]),
    });
  }

  set exposure(v: number) {
    (this.uniforms.get('uExposure') as THREE.Uniform).value = v;
  }

  get exposure(): number {
    return (this.uniforms.get('uExposure') as THREE.Uniform).value as number;
  }
}

/**
 * `wrapEffect`, not `<primitive object={...}>`. EffectComposer reads its children through
 * its own reconciler pass to group them into EffectPasses; a raw primitive is not an
 * effect element as far as that pass is concerned, and the composer it builds renders
 * nothing at all — a completely black frame with no error anywhere.
 */
const Exposure = wrapEffect(ExposureEffect);

// ---------------------------------------------------------------- component

export default function Post({ config }: { config: TierConfig }) {
  const camera = useThree((s) => s.camera);

  const ca = useRef<{ offset: THREE.Vector2 } | null>(null);
  const bloom = useRef<{ intensity: number; mipmapBlurPass?: { radius: number } } | null>(null);
  const dof = useRef<{
    blendMode: { opacity: { value: number } };
    bokehScale: number;
    uniforms: Map<string, THREE.Uniform>;
    cocMaterial: { focusDistance: number; focusRange: number };
  } | null>(null);

  const exposure = useRef<ExposureEffect>(null);

  // Dev handle: the focus pull and the bloom drive both write into postprocessing
  // internals, so they need to be checkable at runtime rather than assumed. (An earlier
  // uniform bug in this project looked correct in source and did nothing on the GPU.)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as { __post?: unknown };
    w.__post = { bloom, dof, exposure };
    return () => {
      delete w.__post;
    };
  }, []);

  useFrame(() => {
    // --- chromatic aberration is a MOTION ARTEFACT, not a filter: zero at rest.
    if (ca.current) {
      const amt = Math.min(scroll.speed * 0.0014, 0.0012);
      ca.current.offset.set(amt, amt * 0.6);
    }

    // --- pre-exposure from the beat table
    const ex = exposure.current;
    if (ex) ex.exposure += (scroll.exposure - ex.exposure) * 0.06;

    if (bloom.current) {
      // The bloom opens as the dolly accelerates and settles back on the holds, so the
      // lens breathes with the movement. Under the HDR chain this rides on top of a
      // threshold of 1.0, so it changes how much the hot sources spread — never whether
      // ordinary lit surfaces start glowing.
      const drive = Math.min(scroll.speed * 1.6, 1);
      const target = 0.62 + drive * 0.26;
      bloom.current.intensity += (target - bloom.current.intensity) * 0.08;
      // `radius` lives on the mipmap blur pass in postprocessing v6, not on the effect.
      const pass = bloom.current.mipmapBlurPass;
      if (pass) pass.radius += (0.72 + drive * 0.14 - pass.radius) * 0.08;
    }

    // --- depth of field. The effect is NEVER mounted or unmounted (that rebuilds the
    //     pass and recompiles shaders mid-scroll); it is enabled once and driven to zero.
    if (dof.current) {
      const want = scroll.dof;
      const coc = dof.current.cocMaterial;
      if (coc) {
        // focusDistance / focusRange are world units in postprocessing 6.39.x;
        // worldFocusDistance is deprecated.
        coc.focusDistance = want > 0 ? want : camera.position.distanceTo(
          new THREE.Vector3(scroll.look.x, scroll.look.y, scroll.look.z),
        );
        coc.focusRange = 14;
      }
      const targetBokeh = want > 0 ? 3.2 : 0;
      dof.current.bokehScale += (targetBokeh - dof.current.bokehScale) * 0.07;
    }
  });

  // The fallback tier has no composer at all; it tone-maps on the renderer instead.
  if (!config.bloom) return null;

  return (
    <EffectComposer
      multisampling={0}
      frameBufferType={THREE.HalfFloatType}
      enableNormalPass={config.ao !== 'off'}
    >
      {config.ao !== 'off' && (
        <N8AO
          aoRadius={2.6}
          intensity={2.1}
          distanceFalloff={0.9}
          color={new THREE.Color('#06110a')}
          quality={config.ao === 'medium' ? 'medium' : 'performance'}
          halfRes={config.aoHalfRes}
          screenSpaceRadius={false}
        />
      )}

      {/* Threshold 1.0 is only meaningful because the buffers are HDR: it selects pixels
          brighter than diffuse white, which in this scene means sources and nothing else. */}
      <Bloom
        ref={bloom as never}
        intensity={0.62}
        luminanceThreshold={1.0}
        luminanceSmoothing={0.12}
        mipmapBlur
        levels={config.bloomLevels}
        radius={0.72}
      />

      <DepthOfField ref={dof as never} focusDistance={14} focusRange={14} bokehScale={0} />

      <Exposure ref={exposure} />

      <ChromaticAberration
        ref={ca as never}
        offset={new THREE.Vector2(0, 0)}
        radialModulation={false}
        modulationOffset={0}
      />

      <ToneMapping mode={ToneMappingMode.AGX} />

      {/* The grade, AFTER tone mapping — this is where AgX's deliberate flatness is put
          back. A LUT would go here on desktop; these two cost essentially nothing and are
          honest about what they do. */}
      <HueSaturation hue={0} saturation={0.04} />
      <BrightnessContrast brightness={-0.02} contrast={0.16} />

      <Vignette eskil={false} offset={0.32} darkness={0.55} />
      {config.noise && <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.05} />}
      {config.smaa && <SMAA preset={SMAAPreset.MEDIUM} />}
    </EffectComposer>
  );
}
