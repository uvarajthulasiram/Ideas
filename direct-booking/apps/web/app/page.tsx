import Link from "next/link";
import { site } from "@direct-booking/sites/selected";

// Scaffold only: proves the static export reads the selected site.
// The real home page (hero, highlights, FAQ, book button) is ported from the mockup in Phase 4.
export default function HomePage() {
  return (
    <main className="page">
      <h1>{site.name}</h1>

      <section id="story" className="slot" aria-label="Story">
        Story slot: built later with the scroll-story-site skill.
      </section>

      <h2>{site.properties.length === 1 ? "The stay" : "Stays"}</h2>
      <ul>
        {site.properties.map((p) => (
          <li key={p.id}>
            <Link href={`/stay/${p.slug}/`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
