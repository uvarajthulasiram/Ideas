import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML in out/, served by Cloudflare Pages. All dynamic work goes through the Worker.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // core and sites are TypeScript source in this monorepo, outside apps/web.
  transpilePackages: ["@direct-booking/core", "@direct-booking/film", "@direct-booking/sites"],
  turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) },
};

export default nextConfig;
