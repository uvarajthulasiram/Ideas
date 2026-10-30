// The Nest Retreat: Allie's cottage in West Seattle.
// Every value marked TODO(host) is a placeholder until Allie or Uvaraj confirms it.
// List them all with `npm run todos`.

import { defineSite } from "@direct-booking/core";

export default defineSite({
  id: "nest-retreat",
  name: "The Nest Retreat",
  domain: null, // TODO(host): domain, to be bought on Cloudflare
  currency: "USD",
  locale: "en-US",
  timezone: "America/Los_Angeles",
  host: {
    name: "Allie",
    alertEmail: "host-alerts@example.com", // TODO(host): host alert email address
  },
  contact: {
    email: "hello@example.com", // TODO(host): guest-facing contact email
    phone: undefined, // TODO(host): guest-facing phone, if Allie wants one shown
  },
  brand: {
    // "Driftwood & Fog", from the :root of ../../../nest-retreat/index.html
    tokens: {
      surface: "#f4f2ee",
      "surface-raised": "#fbfaf7",
      "surface-sunk": "#e8e5df",
      ink: "#22313a",
      "ink-muted": "#5a6267",
      hairline: "#d3cfc8",
      driftwood: "#a07c5b",
      "driftwood-deep": "#6f5038",
      seaglass: "#9fbcae",
      action: "#3f6657",
      "on-action": "#ffffff",
      sound: "#2f4652",
      "on-sound": "#f4f2ee",
      ember: "#a34a22",
      serif: '"Newsreader", Georgia, serif',
      sans: '"Hanken Grotesk", system-ui, sans-serif',
    },
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&display=swap",
  },
  directDiscountPercent: 0, // Allie decides at launch
  // TODO(host): payment rule and cancellation tiers, from Allie's Airbnb policy (Phase 7)
  payment: { fullPaymentWithinDays: 30, depositPercent: 50, balanceDueDaysBeforeArrival: 30 },
  cancellation: [
    { daysBeforeArrival: 30, refundPercent: 100 },
    { daysBeforeArrival: 14, refundPercent: 50 },
    { daysBeforeArrival: 0, refundPercent: 0 },
  ],
  checkInTime: "16:00", // TODO(host): check-in time
  checkOutTime: "11:00", // TODO(host): check-out time
  properties: [
    {
      id: "nest-retreat",
      slug: "the-nest",
      name: "The Nest Retreat",
      summary:
        "A two-bedroom cottage on a quiet West Seattle street, its living space perched above under wood beams and big windows.",
      maxGuests: 4, // TODO(host): confirm max guests (the mockup says sleeps 4)
      bedrooms: 2,
      baths: 2,
      cleaningFee: 0, // TODO(host): cleaning fee, in cents
      taxes: [
        // TODO(host): tax lines and rates, confirmed by Allie's accountant
        { label: "Sales and lodging tax", ratePercent: 0, source: "TODO(host): placeholder, accountant to confirm" },
      ],
      minNights: 2, // TODO(host): minimum nights when PriceLabs gives none
      maxNights: 30,
      icalImports: [
        // TODO(host): Airbnb and VRBO iCal export URLs, e.g.
        // { channel: "airbnb", url: "https://www.airbnb.com/calendar/ical/....ics?s=..." },
        // { channel: "vrbo", url: "https://www.vrbo.com/icalendar/....ics" },
      ],
      pricelabsListingId: null, // TODO(host): PriceLabs listing id
      photos: [], // Added in Phase 4, when web sizes are generated into ./photos
      licence: {
        label: "Seattle STR registration",
        number: "STR-OPLI-26-007039", // TODO(host): confirm; taken from the mockup, and whether it must show on the site
      },
    },
  ],
});
