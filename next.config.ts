import type { NextConfig } from "next";

const config: NextConfig = {
  // Vercel's Next.js adapter creates its own deployment output. Next 16.3's
  // Turbopack build does not emit the root NFT files when that adapter is
  // active, so combining it with standalone output fails during tracing.
  output: process.env.VERCEL ? undefined : "standalone",
  trailingSlash: true,
  devIndicators: false,
  turbopack: { root: process.cwd() },
};
export default config;
