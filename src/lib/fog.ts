import * as THREE from 'three';
import { MOON_DIR, PALETTE } from './world';

/**
 * THE ATMOSPHERE — master doc 2A / 3F.
 *
 * `scene.fog` is null and stays null forever. Three's own fog is applied AFTER tone
 * mapping and colour-space conversion, i.e. in display space, which makes it impossible
 * to grade; and the moment it is switched on, `USE_FOG` is defined and the stock chunks
 * start compositing a second fog underneath this one. So the whole system lives here and
 * is patched into `<opaque_fragment>`, while the light is still linear HDR.
 *
 * The maths is Íñigo Quílez's analytic height fog — the closed-form integral of an
 * exponentially-decaying density along the view ray — with two departures that carry the
 * art direction:
 *
 *   1. EXTINCTION AND IN-SCATTER ARE SEPARATE, AND PER CHANNEL. Standard fog lerps toward
 *      one colour, which is why fogged scenes look like someone lowered a grey card in
 *      front of them. Here, what the fog TAKES (`uFogExtinction`) and what it GIVES BACK
 *      (`uFogInscatter`) are different spectra, so distance desaturates toward emerald
 *      instead of toward the fog colour.
 *   2. THE GREEN IS DIRECTIONAL. In-scatter is tinted by `pow(dot(rayDir, moonDir), 7)`,
 *      so the air only glows where you are looking into the moon. This is the mechanism
 *      that makes "green comes from a source, not from a filter" literally true rather
 *      than a claim in a style guide — turn away from the moon and the air goes grey.
 *
 * Every uniform below is a SHARED object. Each material's `onBeforeCompile` assigns these
 * same references into its own uniform map, so the driver writes `uFogSigma.value` once
 * per frame and the terrain, the rocks, the ridges and all six machines follow together.
 */

export const fogUniforms = {
  /** Density at y = 0. Driven per frame from the zone table via the scroll channel. */
  uFogSigma: { value: 0.02 },
  /** Height falloff. Larger = the fog hugs the ground more tightly. */
  uFogHeight: { value: 0.09 },
  /**
   * Air away from the moon: neutral and dark, but NOT black.
   *
   * PALETTE.fogBase on its own is very nearly black, which meant the medium contributed
   * nothing at all except in the narrow cone pointed at the moon — so every shot that
   * looked sideways at a machine had a dead background and no aerial perspective. Real
   * media scatter in every direction; this is the isotropic share of the moonlight.
   */
  uFogBase: { value: new THREE.Color(PALETTE.fogBase).multiplyScalar(2.0) },
  /** Air looking INTO the moon. This is the only place the emerald comes from. */
  uFogMoon: { value: new THREE.Color(PALETTE.fogMoon).multiplyScalar(0.30) },
  uFogMoonDir: { value: new THREE.Vector3(...MOON_DIR) },
  /**
   * What the medium absorbs, per channel — red goes first, so distance cools.
   *
   * The magnitudes are calibrated against the zone table's sigma values, which are
   * authored art data and must not be rescaled to suit the maths. At the finale's
   * sigma = 0.016 the optical depth across a 200u sight-line comes to about 2.6, so the
   * coefficients have to sit near 0.25 for that shot to read at all. Set to 1.0 — the
   * obvious default — the same shot is completely opaque.
   */
  uFogExtinction: { value: new THREE.Vector3(0.46, 0.33, 0.39) },
  /** What the medium scatters back, per channel — weighted hard toward green. */
  uFogInscatter: { value: new THREE.Vector3(0.12, 0.27, 0.19) },
  /** 512² tiling FBM, used domain-warped so the banks have structure. */
  uFogNoise: { value: null as THREE.Texture | null },
  uFogTime: { value: 0 },
};

export type FogUniforms = typeof fogUniforms;

/** Declarations + the fog function itself. Goes next to `<common>` in a fragment shader. */
export const FOG_PARS = /* glsl */ `
  uniform float uFogSigma;
  uniform float uFogHeight;
  uniform vec3 uFogBase;
  uniform vec3 uFogMoon;
  uniform vec3 uFogMoonDir;
  uniform vec3 uFogExtinction;
  uniform vec3 uFogInscatter;
  uniform sampler2D uFogNoise;
  uniform float uFogTime;

  /**
   * Returns how much atmosphere sits between the camera and a world-space point, as the
   * analytic integral of density = uFogSigma * exp(-y * uFogHeight) along the ray.
   * Split out from the colour maths because the fog CARDS need this number too — a card
   * that ignored the height field would float in front of its own bank.
   */
  float lunarFogAmount(vec3 worldPos) {
    vec3 rd = worldPos - cameraPosition;
    float dist = length(rd);
    rd /= max(dist, 1e-4);

    float b = uFogHeight;
    float ey = exp(-cameraPosition.y * b);
    float amt;
    if (abs(rd.y) < 1e-3) {
      // Level ray: the integral degenerates to plain distance fog at this altitude.
      amt = uFogSigma * ey * dist;
    } else {
      amt = (uFogSigma / b) * ey * (1.0 - exp(-dist * rd.y * b)) / rd.y;
    }

    // Domain-warped tiling noise. Without it the fog is a perfect gradient and reads as a
    // post-process; with it the banks have edges that the camera can travel THROUGH.
    vec2 w = worldPos.xz * 0.0055 + uFogTime * 0.0035;
    vec2 warp = texture2D(uFogNoise, w).rg * 2.0 - 1.0;
    vec2 nuv = worldPos.xz * 0.0125 + warp * 0.30 + uFogTime * vec2(0.0022, -0.0016);
    float n = texture2D(uFogNoise, nuv).g;
    amt *= 0.58 + 0.84 * n;

    return max(amt, 0.0);
  }

  vec3 applyLunarFog(vec3 col, vec3 worldPos) {
    float amt = lunarFogAmount(worldPos);
    vec3 rd = normalize(worldPos - cameraPosition);

    vec3 transmittance = exp(-amt * uFogExtinction);
    vec3 scattered = vec3(1.0) - exp(-amt * uFogInscatter);

    // The directional term, as isotropic base plus forward lobe rather than a lerp
    // between them. A lerp is all-or-nothing: the moon sits nearly down the corridor, so
    // any exponent low enough to make the lobe visible tinted the ENTIRE frame emerald,
    // and any exponent high enough to stop that killed the effect outright. Real media
    // scatter in every direction and merely scatter HARDEST toward the light.
    float md = max(dot(rd, uFogMoonDir), 0.0);
    vec3 fogCol = uFogBase * (0.6 + 0.4 * md) + uFogMoon * pow(md, 6.0);

    return col * transmittance + fogCol * scattered;
  }
`;

/**
 * Patches a three.js material shader in place. Call this from inside a material's own
 * `onBeforeCompile` — it composes with whatever else that function does rather than
 * replacing it, which is the whole reason this is a function over a shader string.
 *
 * The insertion point is `<opaque_fragment>`, not `<fog_fragment>`: the stock fog hook
 * fires after tone mapping, and fog applied to display-referred pixels cannot be graded.
 */
export function patchFog(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, fogUniforms);

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n  varying vec3 vFogWorld;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n  varying vec3 vFogWorld;\n${FOG_PARS}`)
    .replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\n  gl_FragColor.rgb = applyLunarFog(gl_FragColor.rgb, vFogWorld);',
    );
}
