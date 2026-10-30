import type { Metadata } from "next";
import { Cancelled } from "../../../components/BookingStatus";
import { Page } from "../../../components/Page";
import { primaryProperty, site } from "../../../lib/site";
import { withBase } from "../../../lib/base";

export const metadata: Metadata = { title: `Booking not completed · ${site.name}` };

export default function CancelledPage() {
  return (
    <Page>
      <div className="wrap page-head">
        <Cancelled propertyPath={withBase(`/stay/${primaryProperty.slug}/`)} />
      </div>
    </Page>
  );
}
