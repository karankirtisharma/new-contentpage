import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Three Fiber's `useFrame` runs on the render loop, OUTSIDE React's render
    // phase, and its entire contract is to mutate three.js objects in place — camera
    // transforms, material uniforms, group visibility. That is the documented, correct
    // way to drive a scene at 60fps; going through React state per frame would re-render
    // the tree every tick.
    //
    // The React Compiler's immutability rule has no model for that escape hatch, so it
    // flags every correct `useFrame` body. Scoped off for the scene layer only — the
    // DOM layer in components/dom keeps the rule, and `react-hooks/purity` stays on
    // everywhere (it caught a real bug: Math.random seeding the dust fields).
    files: ['src/components/scene/**/*.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
