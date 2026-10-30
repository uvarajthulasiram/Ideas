import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { site } from "@direct-booking/sites/selected";
import "./globals.css";

export const metadata: Metadata = {
  title: site.name,
  // Not indexed until launch.
  robots: { index: false, follow: false },
};

// The site's brand tokens become CSS custom properties, e.g. --ink, --action.
const brandVars = Object.fromEntries(
  Object.entries(site.brand.tokens).map(([name, value]) => [`--${name}`, value]),
) as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={site.locale} style={brandVars}>
      <head>
        {site.brand.fontsHref && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={site.brand.fontsHref} />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
