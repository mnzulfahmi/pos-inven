import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  trailingSlash: true,
  devIndicators: false,
  turbopack: { root: process.cwd() },
};
export default config;
