// Reads the site's Markdown content at build time (server components only).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { site } from "@direct-booking/sites/selected";
import { fill } from "./site";

const contentDir = join(process.cwd(), "..", "..", "sites", site.id, "content");

export function contentPath(name: string): string {
  return join(contentDir, name);
}

/** A content file with {{placeholders}} filled from config. */
export function contentFile(name: string): string {
  return fill(readFileSync(join(contentDir, name), "utf8"));
}
