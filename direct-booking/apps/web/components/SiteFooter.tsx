import Link from "next/link";
import { content, site } from "../lib/site";

export function SiteFooter() {
  const licences = site.properties.filter((p) => p.licence);
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <div className="stack" style={{ gap: 4 }}>
          <span className="brand" style={{ fontSize: 20 }}>
            {site.name}
          </span>
          {licences.map((p) => (
            <span key={p.id}>
              {p.licence!.label} {p.licence!.number}
            </span>
          ))}
          <span>
            <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
            {site.contact.phone ? ` · ${site.contact.phone}` : ""}
          </span>
        </div>
        <nav aria-label="Policies" className="site-footer__links">
          {content.footerLinks.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
