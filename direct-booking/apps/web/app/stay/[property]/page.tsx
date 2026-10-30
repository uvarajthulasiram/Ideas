import { notFound } from "next/navigation";
import { site } from "@direct-booking/sites/selected";

// One static page per property in the site config.
export const dynamicParams = false;

export function generateStaticParams() {
  return site.properties.map((p) => ({ property: p.slug }));
}

export default async function PropertyPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: slug } = await params;
  const property = site.properties.find((p) => p.slug === slug);
  if (!property) notFound();

  // Scaffold only. Photos, calendar and live quote arrive in Phase 4.
  return (
    <main className="page">
      <h1>{property.name}</h1>
      <p>{property.summary}</p>
      <p>
        {property.bedrooms} bedrooms · {property.baths} baths · sleeps {property.maxGuests}
      </p>
      <p>
        Check-in {property.checkInTime} · Check-out {property.checkOutTime}
      </p>
      {property.licence && (
        <p>
          {property.licence.label} {property.licence.number}
        </p>
      )}
    </main>
  );
}
