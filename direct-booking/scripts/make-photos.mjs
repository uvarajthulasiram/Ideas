#!/usr/bin/env node
// Generates web sizes of a host's photos: AVIF and WebP at 3 widths, never upscaled.
//
//   node scripts/make-photos.mjs <source-dir> <site-id>
//   node scripts/make-photos.mjs ../nest-retreat/photos nest-retreat
//
// Writes sites/<site-id>/photos/<name>-<width>.{avif,webp} plus manifest.json
// (each photo's widths and intrinsic size), which the site reads at build time.
// Uses macOS tools: `sips` (AVIF) and `cwebp` (brew install webp).

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTHS = [480, 800, 1280];
const [sourceDir, siteId] = process.argv.slice(2);
if (!sourceDir || !siteId) {
  console.error("Usage: node scripts/make-photos.mjs <source-dir> <site-id>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "sites", siteId, "photos");
mkdirSync(outDir, { recursive: true });

function size(file) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], { encoding: "utf8" });
  return { width: Number(/pixelWidth: (\d+)/.exec(out)[1]), height: Number(/pixelHeight: (\d+)/.exec(out)[1]) };
}

const manifest = {};
for (const file of readdirSync(sourceDir).filter((f) => /\.(png|jpe?g|heic|tiff?)$/i.test(f)).sort()) {
  const src = join(sourceDir, file);
  const name = basename(file, extname(file));
  const { width, height } = size(src);
  const widths = [...new Set(WIDTHS.map((w) => Math.min(w, width)))];
  for (const w of widths) {
    const avif = join(outDir, `${name}-${w}.avif`);
    const webp = join(outDir, `${name}-${w}.webp`);
    execFileSync("sips", ["-s", "format", "avif", "-s", "formatOptions", "55", "--resampleWidth", String(w), src, "--out", avif], { stdio: "ignore" });
    execFileSync("cwebp", ["-quiet", "-q", "78", "-resize", String(w), "0", src, "-o", webp]);
  }
  manifest[name] = { widths, width, height };
  console.log(`${name}: ${widths.join(", ")} (from ${width}×${height})`);
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
