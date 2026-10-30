// The selected site's config, content and photos, with build-time checks.

import { fillTemplate, policyFacts, type PropertyConfig } from "@direct-booking/core";
import { content, photoManifest, site } from "@direct-booking/sites/selected";

export { content, site };

export const primaryProperty = site.properties[0]!;

export function propertyContent(property: PropertyConfig) {
  const c = content.properties[property.id];
  if (!c) throw new Error(`No content for property "${property.id}" in sites/${site.id}/content`);
  return c;
}

/** Fill {{placeholders}} from the property's config (the first property for site-wide copy). */
export function fill(text: string, property: PropertyConfig = primaryProperty): string {
  return fillTemplate(text, policyFacts(site, property));
}

export interface PhotoInfo {
  name: string;
  alt: string;
  width: number;
  height: number;
  widths: number[];
}

const alts = new Map(site.properties.flatMap((p) => p.photos.map((ph) => [ph.file, ph.alt] as const)));
const manifest = photoManifest as Record<string, { widths: number[]; width: number; height: number }>;

/** A photo by name; a missing file or alt text fails the build. */
export function photo(name: string): PhotoInfo {
  const m = manifest[name];
  if (!m) throw new Error(`Photo "${name}" is not in sites/${site.id}/photos/manifest.json`);
  const alt = alts.get(name);
  if (!alt) throw new Error(`Photo "${name}" has no alt text in sites/${site.id}/site.ts`);
  return { name, alt, ...m };
}
