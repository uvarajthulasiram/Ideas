import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { site } from "../lib/site";
import "./globals.css";
import { withBase } from "../lib/base";

export const metadata: Metadata = {
  title: site.name,
  // Not indexed until launch.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: site.brand.tokens.surface };

// The site's brand tokens become CSS custom properties, e.g. --ink, --action.
const brandVars = Object.fromEntries(Object.entries(site.brand.tokens).map(([name, value]) => [`--${name}`, value])) as CSSProperties;

// Self-hosted fonts (copied to /fonts/ by scripts/select-site.mjs).
const fontFaces = site.brand.fonts
  .map((f) => `@font-face{font-family:"${f.family}";src:url("${withBase(`/fonts/${f.file}`)}") format("woff2");font-style:${f.style};font-weight:${f.weight};font-display:swap}`)
  .join("");

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={site.locale} style={brandVars}>
      <head>
        {site.brand.fonts
          .filter((f) => f.preload)
          .map((f) => (
            <link key={f.file} rel="preload" href={withBase(`/fonts/${f.file}`)} as="font" type="font/woff2" crossOrigin="" />
          ))}
        <style dangerouslySetInnerHTML={{ __html: fontFaces }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
