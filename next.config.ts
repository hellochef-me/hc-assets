import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingExcludes: {
    "/*": [
      "./.local/**/*",
      "./.env*",
      "./tests/**/*",
      "./docs/screenshots/**/*",
    ],
  },
};
export default config;
