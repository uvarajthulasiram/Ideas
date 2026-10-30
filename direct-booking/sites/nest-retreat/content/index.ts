// The Nest Retreat's words, photos and section order. Copy ported from the mockup
// in ../../../nest-retreat/. {{placeholders}} are filled from site.ts (see
// policyFacts in packages/core), so no policy figure is typed here.
// Rules: no em dashes, US spelling, and no copy nudging channel guests to switch to this site.

import { defineContent } from "@direct-booking/core";

export default defineContent({
  nav: [
    { label: "The cottage", href: "/stay/the-nest/" },
    { label: "The story", href: "/#story" },
    { label: "Allie's guide", href: "/#guide" },
    { label: "Questions", href: "/#questions" },
  ],

  hero: {
    eyebrow: "West Seattle · A coastal cottage",
    title: "A small home with a big view of the *sky*.",
    lede: "The Nest Retreat is a two-bedroom cottage on a quiet West Seattle street, its living space perched above under wood beams and big windows. Lowman Beach is just under a mile's walk away.",
    facts: "{{bedrooms}} bedrooms · {{baths}} private baths · sleeps {{maxGuests}}",
    photo: { photo: "living-window-wall", caption: "The living room, upstairs under the wood ceiling." },
  },

  searchNote: "You'll see the full price, taxes included, before you pay anything.",

  home: [
    { type: "story" },
    {
      type: "feature",
      eyebrow: "The cottage",
      title: "Part cabin, part *beach house*",
      body: [
        "The main living space sits upstairs: a well-stocked kitchen, a living room with a fireplace, a dining nook and a desk for work, all under a high wood ceiling.",
        "Out back, a fenced yard with a propane fire pit and seating. The garage has free parking and EV charging.",
      ],
      photo: { photo: "firepit-patio", caption: "The fire pit, in the fenced garden." },
      link: { label: "See the whole cottage", href: "/stay/the-nest/" },
    },
    {
      type: "feature",
      eyebrow: "Traveling together",
      title: "Two couples. *Two floors.* Two private baths.",
      body: ["Each bedroom has its own bathroom, one on each level. Nobody waits for the shower, and nobody shares a wall with the other bed."],
      photo: { photo: "bedroom-upstairs", caption: "The king room, upstairs." },
      reverse: true,
      items: [
        { eyebrow: "Upstairs", title: "King bedroom and full bath", body: "Beside the living space, with high ceilings and natural light." },
        { eyebrow: "Downstairs", title: "Queen bedroom and its own bath", body: "The quieter floor, with French doors to the patio, next to the washer, dryer and garage." },
      ],
    },
    {
      type: "stats",
      id: "work",
      eyebrow: "Staying to work",
      title: "A work week *by the Sound*",
      body: ["Keep your hours, then close the laptop and be at the beach before sunset."],
      stats: [
        // TODO(host): measured Wi-Fi download speed, e.g. { value: "300 Mbps", label: "Wi-Fi, measured download speed" }
        { value: "1 desk", label: "A dedicated workspace upstairs" },
        { value: "EV ready", label: "Charging in the garage, free parking" },
        { value: "In-unit", label: "Washer and dryer for longer stays" },
      ],
    },
    {
      type: "guide",
      id: "guide",
      eyebrow: "The neighborhood",
      title: "Allie's guide to *West Seattle*",
      body: "Beach walks one way, cafés the other, and forest trails in between.",
      groups: [
        {
          title: "Close by",
          items: [
            { name: "Lowman Beach", text: "Just under a mile's walk. Sunsets over the Sound." },
            { name: "Lincoln Park", text: "Forested trails and a long waterfront path." },
            { name: "Downtown West Seattle", text: "Cafés, shops and restaurants, about a mile away." },
            { name: "Fauntleroy ferry", text: "Nearby, for a day trip to Vashon Island." },
          ],
        },
        // TODO(host): "Allie's picks": morning coffee, bakery, dinner, rainy day (name and one line each).
      ],
    },
    {
      type: "steps",
      id: "arrival",
      eyebrow: "How it works",
      title: "From booking to arrival",
      tone: "dark",
      steps: [
        { title: "Book and pay securely", body: "{{payment}} Payment is handled by Stripe." },
        { title: "Get your arrival guide", body: "Directions, parking and Wi-Fi details arrive by email before your stay." },
        { title: "Let yourself in", body: "Self check-in from {{checkInTime}}. Your door code arrives before you do." },
      ],
    },
    // The guestbook section returns once there are real notes from stays booked here.
    { type: "faq", id: "questions", eyebrow: "Before you book", title: "Questions guests ask", body: "Something else? Email Allie at {{contactEmail}}." },
    { type: "policies", id: "policies" },
  ],

  // No closing section: the story's finale says "Settle in and stay a while." (story-notes.md).

  properties: {
    "nest-retreat": {
      eyebrow: "Entire home · West Seattle",
      beds: "1 king, 1 queen",
      hero: { photo: "living-window-wall", caption: "The living room, upstairs." },
      gallery: ["living-kitchen-open-plan", "kitchen-island", "bedroom-upstairs", "bedroom-garden-doors", "firepit-patio"],
      areas: [
        { title: "Upstairs", body: "Kitchen, living room with fireplace, dining nook, work desk, king bedroom and full bath. High ceilings and plenty of natural light." },
        { title: "Downstairs", body: "A quieter queen bedroom with its own bathroom and French doors to the patio, a washer and dryer, and the garage." },
        { title: "Outside", body: "A fenced backyard with a propane fire pit and seating. Free parking in the garage, with EV charging." },
      ],
      amenities: [
        { icon: "kitchen", label: "Fully stocked kitchen" },
        { icon: "fire", label: "Fireplace and fire pit" },
        { icon: "bolt", label: "EV charging, free parking" },
        { icon: "desk", label: "Desk and fast Wi-Fi" },
        { icon: "washer", label: "Washer and dryer" },
        { icon: "alarm", label: "Smoke and CO alarms" },
      ],
      where: "A quiet residential street in West Seattle ({{location}}), just under a mile from Lowman Beach, with beaches, cafés, restaurants and downtown Seattle minutes away. The exact address is sent after you book.",
      goodToKnow: [
        "Check-in from {{checkInTime}} · Check-out by {{checkOutTime}} · Self check-in",
        // TODO(host): house rules summary, e.g. no parties, quiet hours, pets policy
      ],
      bookingPhoto: "living-window-wall",
      bookingSubtitle: "West Seattle · hosted by {{hostName}}",
    },
  },

  footerLinks: [
    { label: "House rules", href: "/house-rules/" },
    { label: "Cancellation", href: "/cancellation/" },
    { label: "Booking terms", href: "/terms/" },
    { label: "Privacy", href: "/privacy/" },
  ],
});
