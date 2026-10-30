import type { Metadata } from "next";
import { Admin } from "../../components/Admin";
import { site } from "../../lib/site";

export const metadata: Metadata = { title: `Admin · ${site.name}`, robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <main id="main" className="wrap page-head" style={{ paddingBottom: 96 }}>
      <p className="eyebrow">{site.name}</p>
      <h1 className="h2">Host admin</h1>
      <Admin l={{ currency: site.currency, locale: site.locale }} properties={site.properties.map((p) => ({ id: p.id, name: p.name }))} />
    </main>
  );
}
