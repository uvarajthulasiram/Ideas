import type { Metadata } from "next";
import { Confirmed } from "../../../components/BookingStatus";
import { Page } from "../../../components/Page";
import { site } from "../../../lib/site";

export const metadata: Metadata = { title: `Booking confirmed · ${site.name}` };

export default function ConfirmedPage() {
  return (
    <Page>
      <div className="wrap page-head">
        <Confirmed l={{ currency: site.currency, locale: site.locale }} contactEmail={site.contact.email} />
      </div>
    </Page>
  );
}
