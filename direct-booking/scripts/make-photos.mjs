#!/usr/bin/env node
// Generates web sizes of a host's photos: WebP at 3 widths, never upscaled.
// (No AVIF: macOS sips writes large AVIFs that Chromium draws as fully transparent.)
//
//   node scripts/make-photos.mjs <source-dir> <site-id>
//   node scripts/make-photos.mjs ../nest-retreat/photos nest-retreat
//
// Writes sites/<site-id>/photos/<name>-<width>.webp plus manifest.json
// (each photo's widths and intrinsic size), which the site reads at build time.
// Uses macOS `sips` (to flatten the source) and `cwebp` (brew install webp).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

// Photos are opaque: flatten each source to an 8-bit JPEG first.
const work = mkdtempSync(join(tmpdir(), "make-photos-"));
const manifest = {};
for (const file of readdirSync(sourceDir).filter((f) => /\.(png|jpe?g|heic|tiff?)$/i.test(f)).sort()) {
  const name = basename(file, extname(file));
  const src = join(work, `${name}.jpg`);
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "100", join(sourceDir, file), "--out", src], { stdio: "ignore" });
  const { width, height } = size(src);
  const widths = [...new Set(WIDTHS.map((w) => Math.min(w, width)))];
  for (const w of widths) {
    const webp = join(outDir, `${name}-${w}.webp`);
    execFileSync("cwebp", ["-quiet", "-q", "78", "-resize", String(w), "0", src, "-o", webp]);
  }
  manifest[name] = { widths, width, height };
  console.log(`${name}: ${widths.join(", ")} (from ${width}×${height})`);
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
rmSync(work, { recursive: true, force: true });
