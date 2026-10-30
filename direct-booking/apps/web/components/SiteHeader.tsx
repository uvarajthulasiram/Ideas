import Link from "next/link";
import { content, primaryProperty, site } from "../lib/site";

export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="wrap site-header__inner">
        <Link className="brand" href="/">
          {site.name}
        </Link>
        <nav aria-label="Main" className="site-nav">
          {content.nav.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <Link className="button button--small" href={`/stay/${primaryProperty.slug}/`}>
            Book your stay
          </Link>
        </nav>
      </div>
    </header>
  );
}
