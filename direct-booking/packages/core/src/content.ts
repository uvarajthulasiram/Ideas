// Shape of a site's written content (sites/<id>/content/index.ts). The web app
// renders these section types; the words, photos and order belong to the site.
// Any string may use *emphasis* (in titles) and {{placeholders}} from policyFacts().

export interface PhotoRef {
  /** Photo name from sites/<id>/photos/manifest.json; alt text comes from site.ts. */
  photo: string;
  caption?: string;
}

export interface Link {
  label: string;
  href: string;
}

export type HomeSection =
  | { type: "story" }
  | { type: "feature"; id?: string; eyebrow: string; title: string; body: string[]; photo?: PhotoRef; link?: Link; items?: { eyebrow: string; title: string; body: string }[]; reverse?: boolean }
  | { type: "timeline"; id?: string; eyebrow: string; title: string; steps: { eyebrow: string; title: string; body: string; photo?: string }[] }
  | { type: "stats"; id?: string; eyebrow: string; title: string; body: string[]; stats: { value: string; label: string }[] }
  | { type: "guide"; id?: string; eyebrow: string; title: string; body: string; photo?: PhotoRef; groups: { title: string; items: { name: string; text: string }[] }[] }
  | { type: "steps"; id?: string; eyebrow: string; title: string; tone?: "dark"; steps: { title: string; body: string }[] }
  | { type: "faq"; id?: string; eyebrow: string; title: string; body?: string }
  | { type: "policies"; id?: string };

export type AmenityIcon = "kitchen" | "fire" | "bolt" | "desk" | "washer" | "alarm" | "parking" | "wifi";

export interface PropertyContent {
  eyebrow: string;
  /** Rooms line, e.g. "1 king, 1 queen", shown after bedrooms and baths. */
  beds?: string;
  hero: PhotoRef;
  gallery: string[];
  areas: { title: string; body: string }[];
  amenities: { icon: AmenityIcon; label: string }[];
  where: string;
  goodToKnow: string[];
  /** Shown beside the trip summary on the booking page. */
  bookingPhoto: string;
  bookingSubtitle: string;
}

export interface SiteContent {
  nav: Link[];
  hero: { eyebrow: string; title: string; lede: string; facts: string; photo: PhotoRef };
  searchNote: string;
  home: HomeSection[];
  closing: { title: string; cta: string };
  properties: Record<string, PropertyContent>;
  footerLinks: Link[];
}

export function defineContent(content: SiteContent): SiteContent {
  return content;
}
