// Photos are local data URLs and the official logo is SVG; image optimization is inapplicable.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "@next/next/no-img-element": "off" } },
  globalIgnores([
    ".next/**",
    ".local/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);
