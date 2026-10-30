import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HOLD_MINUTES } from "@direct-booking/core";
import { BookingForm } from "../../../components/BookingForm";
import { Page } from "../../../components/Page";
import { Photo } from "../../../components/Photo";
import { fill, propertyContent, site } from "../../../lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return site.properties.map((p) => ({ property: p.slug }));
}

type Params = { params: Promise<{ property: string }> };

export const metadata: Metadata = { title: `Book · ${site.name}` };

export default async function BookPage({ params }: Params) {
  const { property: slug } = await params;
  const property = site.properties.find((p) => p.slug === slug);
  if (!property) notFound();
  const c = propertyContent(property);
  const f = (t: string) => fill(t, property);

  return (
    <Page>
      <div className="wrap" style={{ paddingTop: 24 }}>
        <ol className="progress" aria-label="Booking steps">
          <li>1. Dates</li>
          <li aria-current="step">2. Your details</li>
          <li>3. Secure payment</li>
        </ol>
      </div>
      <div className="wrap">
        <BookingForm
          property={{ id: property.id, slug: property.slug, name: property.name, maxGuests: property.maxGuests }}
          l={{ currency: site.currency, locale: site.locale }}
          holdMinutes={HOLD_MINUTES}
          policies={
            <>
              <p>
                <strong>Cancellation:</strong> {f("{{cancellation}}")}
              </p>
              <p>
                <strong>Paying:</strong> {f("{{payment}}")}
              </p>
            </>
          }
          tripHeader={
            <>
              <Photo name={c.bookingPhoto} sizes="(min-width: 900px) 360px, 100vw" variant="wide" decorative />
              <div className="stack" style={{ gap: 4 }}>
                <h2 className="h3">{property.name}</h2>
                <p className="small muted">{f(c.bookingSubtitle)}</p>
              </div>
            </>
          }
        />
      </div>
    </Page>
  );
}
