import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// NEXT_BASE_PATH serves the build from a subfolder, e.g. /Ideas/nest-retreat-site on GitHub Pages.
const basePath = process.env.NEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath ?? "" },
  // Static HTML in out/, served by Cloudflare Pages. All dynamic work goes through the Worker.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // core and sites are TypeScript source in this monorepo, outside apps/web.
  transpilePackages: ["@direct-booking/core", "@direct-booking/film", "@direct-booking/sites"],
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default nextConfig;
