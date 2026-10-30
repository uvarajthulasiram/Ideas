import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingWidget } from "../../../components/BookingWidget";
import { Icon } from "../../../components/Icon";
import { Page } from "../../../components/Page";
import { Photo } from "../../../components/Photo";
import { fill, propertyContent, site } from "../../../lib/site";

// One static page per property in the site config.
export const dynamicParams = false;

export function generateStaticParams() {
  return site.properties.map((p) => ({ property: p.slug }));
}

type Params = { params: Promise<{ property: string }> };

const find = async ({ params }: Params) => {
  const { property: slug } = await params;
  return site.properties.find((p) => p.slug === slug);
};

export async function generateMetadata(props: Params): Promise<Metadata> {
  const property = await find(props);
  return { title: property ? `${property.name} · ${site.name}` : site.name };
}

export default async function PropertyPage(props: Params) {
  const property = await find(props);
  if (!property) notFound();
  const c = propertyContent(property);
  const f = (t: string) => fill(t, property);

  return (
    <Page current={`/stay/${property.slug}/`}>
      <section aria-label="Photos" className="wrap gallery">
        <Photo name={c.hero.photo} caption={c.hero.caption} sizes="(min-width: 1200px) 1104px, 100vw" variant="hero" priority />
        <div className="gallery__more">
          {c.gallery.map((name) => (
            <Photo key={name} name={name} sizes="(min-width: 900px) 360px, 100vw" variant="wide" />
          ))}
        </div>
      </section>

      <div className="wrap property">
        <div className="property__main">
          <div className="stack" style={{ gap: 12 }}>
            <p className="eyebrow">{f(c.eyebrow)}</p>
            <h1 className="display" style={{ fontSize: "clamp(40px, 6vw, 72px)" }}>
              {property.name}
            </h1>
            <p className="small">
              {property.bedrooms} bedrooms · {property.baths} baths{c.beds ? ` · ${c.beds}` : ""} · sleeps {property.maxGuests}
            </p>
            {property.summary && <p>{property.summary}</p>}
          </div>

          <section aria-labelledby="space">
            <h2 id="space" className="h3">
              The space, floor by floor
            </h2>
            <div className="areas">
              {c.areas.map((a) => (
                <div key={a.title} className="stack" style={{ gap: 8 }}>
                  <h3 className="h4">{a.title}</h3>
                  <p className="small">{f(a.body)}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="amenities">
            <h2 id="amenities" className="h3">
              What&apos;s here
            </h2>
            <ul className="amenities">
              {c.amenities.map((a) => (
                <li key={a.label}>
                  <Icon name={a.icon} />
                  {f(a.label)}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="where">
            <h2 id="where" className="h3">
              Where you&apos;ll be
            </h2>
            <p className="small">{f(c.where)}</p>
          </section>

          <section aria-labelledby="know">
            <h2 id="know" className="h3">
              Good to know
            </h2>
            {c.goodToKnow.map((line) => (
              <p key={line} className="small">
                {f(line)}
              </p>
            ))}
            <p className="small">{f("{{cancellation}}")}</p>
            {property.licence && (
              <p className="small muted">
                {property.licence.label} {property.licence.number}
              </p>
            )}
          </section>
        </div>

        <aside className="property__aside" aria-label={`Book ${property.name}`}>
          <BookingWidget
            property={{ id: property.id, slug: property.slug, name: property.name, maxGuests: property.maxGuests, minNights: property.minNights, timezone: property.timezone }}
            l={{ currency: site.currency, locale: site.locale }}
          />
        </aside>
      </div>
    </Page>
  );
}
