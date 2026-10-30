import type { Deps } from "../src/deps";
import type { OutgoingEmail } from "../src/email";
import type { ChargeInput, CheckoutInput, PaymentEvent, Payments } from "../src/payments";
import { fixturePriceSource, type PriceSource } from "../src/prices";

export interface FakePayments extends Payments {
  checkouts: CheckoutInput[];
  expired: string[];
  refunds: { paymentIntentId: string; amount: number; key: string }[];
  charges: ChargeInput[];
  failCheckout: boolean;
  /** Set to a reason to make off-session charges decline. */
  declineCharges: string | null;
}

export function fakeStripe(): FakePayments {
  const p: FakePayments = {
    name: "stripe",
    checkouts: [],
    expired: [],
    refunds: [],
    charges: [],
    failCheckout: false,
    declineCharges: null,
    async createCheckout(input) {
      if (p.failCheckout) throw new Error("Stripe is down");
      p.checkouts.push(input);
      return { id: `cs_test_${p.checkouts.length}`, url: `https://checkout.stripe.test/${p.checkouts.length}` };
    },
    async expireCheckout(id) {
      p.expired.push(id);
    },
    async chargeSaved(input) {
      p.charges.push(input);
      return p.declineCharges ? { ok: false, paymentIntentId: "pi_declined", reason: p.declineCharges } : { ok: true, paymentIntentId: `pi_${input.idempotencyKey}` };
    },
    async parseWebhook(raw, sig) {
      if (sig !== "valid") throw new Error("bad signature");
      return JSON.parse(raw) as PaymentEvent;
    },
    async refund(paymentIntentId, amount, _reason, key) {
      p.refunds.push({ paymentIntentId, amount, key });
      return { id: `re_${key}` };
    },
  };
  return p;
}

/** Deps with a fixed clock and canned responses for outbound fetches, keyed by URL. */
export function testDeps(
  options: { now?: string; responses?: Record<string, Response | (() => Response)>; prices?: PriceSource; payments?: FakePayments; turnstileOk?: boolean; failEmail?: (e: OutgoingEmail) => boolean } = {},
): Deps & { fetched: string[]; sent: OutgoingEmail[]; payments: FakePayments; setNow: (iso: string) => void } {
  const fetched: string[] = [];
  const sent: OutgoingEmail[] = [];
  let now = new Date(options.now ?? "2026-11-01T18:00:00Z");
  return {
    fetched,
    sent,
    now: () => now,
    setNow: (iso) => {
      now = new Date(iso);
    },
    prices: options.prices ?? fixturePriceSource,
    payments: options.payments ?? fakeStripe(),
    turnstile: { verify: async (token) => (options.turnstileOk ?? true) && token === "ok-token" },
    mailer: {
      async send(e) {
        if (options.failEmail?.(e)) throw new Error("E_INTERNAL_SERVER_ERROR");
        sent.push(e);
      },
    },
    fetch: async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      fetched.push(url);
      const r = options.responses?.[url];
      if (!r) throw new Error(`Unexpected fetch ${url}`);
      return typeof r === "function" ? r() : r.clone();
    },
  };
}

export function ics(text: string): Response {
  return new Response(text, { headers: { "content-type": "text/calendar" } });
}
