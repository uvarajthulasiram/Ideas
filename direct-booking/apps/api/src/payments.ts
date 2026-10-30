// Stripe, behind a small interface so tests and local development can use a fake.
// Test-mode keys only until launch (PLAN.md, Phase 8).

import Stripe from "stripe";

export interface CheckoutInput {
  bookingId: string;
  /** Minor units charged now. */
  amount: number;
  currency: string;
  description: string;
  customerEmail: string;
  /** Unix seconds; at least 30 minutes ahead (Stripe's minimum). */
  expiresAt: number;
  successUrl: string;
  cancelUrl: string;
  /** Save the card for an off-session balance charge later. */
  saveCard: boolean;
  metadata: Record<string, string>;
}

/** The parts of a Stripe event the webhook uses. */
export interface PaymentEvent {
  id: string;
  type: string;
  session?: {
    id: string;
    /** "balance" for a balance payment link sent after an off-session charge failed. */
    kind: "booking" | "balance";
    bookingId: string | null;
    paymentStatus: string;
    amountTotal: number;
    paymentIntentId: string | null;
    customerId: string | null;
  };
}

export interface ChargeInput {
  customerId: string;
  /** The deposit's PaymentIntent, whose card was saved for this charge. */
  depositPaymentIntentId: string;
  amount: number;
  currency: string;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export type ChargeResult = { ok: true; paymentIntentId: string } | { ok: false; paymentIntentId: string | null; reason: string };

export interface Payments {
  readonly name: "stripe" | "fake";
  createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }>;
  expireCheckout(sessionId: string): Promise<void>;
  /** Verifies the signature; throws if it doesn't match. */
  parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent>;
  /** Off-session charge of the saved card. Declines are results, not exceptions. */
  chargeSaved(input: ChargeInput): Promise<ChargeResult>;
  /** Same idempotency key, same refund: safe to retry. */
  refund(paymentIntentId: string, amount: number, reason: string, idempotencyKey: string): Promise<{ id: string }>;
}

export function stripePayments(secretKey: string, webhookSecret: string): Payments {
  if (secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_")) {
    // Guard rail until launch: PLAN.md keeps live keys out of every phase before 8.
    throw new Error("Live Stripe key refused: test mode only before launch");
  }
  const stripe = new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });
  const crypto = Stripe.createSubtleCryptoProvider();

  return {
    name: "stripe",
    async createCheckout(input) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        // Cards only (Apple Pay and Google Pay are cards): holds and off-session balance charges need instant card payments.
        allowed_payment_method_types: ["card"],
        customer_email: input.customerEmail,
        ...(input.saveCard ? { customer_creation: "always" as const } : {}),
        client_reference_id: input.bookingId,
        expires_at: input.expiresAt,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: input.metadata,
        payment_intent_data: {
          description: input.description,
          metadata: input.metadata,
          ...(input.saveCard ? { setup_future_usage: "off_session" as const } : {}),
        },
        line_items: [
          {
            quantity: 1,
            price_data: { currency: input.currency.toLowerCase(), unit_amount: input.amount, product_data: { name: input.description } },
          },
        ],
      });
      if (!session.url) throw new Error("Stripe returned no Checkout URL");
      return { id: session.id, url: session.url };
    },

    async expireCheckout(sessionId) {
      await stripe.checkout.sessions.expire(sessionId);
    },

    async parseWebhook(rawBody, signature) {
      if (!signature) throw new Error("Missing Stripe-Signature header");
      const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, crypto);
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
        const s = event.data.object;
        const id = (v: string | { id: string } | null) => (v === null ? null : typeof v === "string" ? v : v.id);
        return {
          id: event.id,
          type: event.type,
          session: {
            id: s.id,
            kind: s.metadata?.kind === "balance" ? "balance" : "booking",
            bookingId: s.metadata?.bookingId ?? s.client_reference_id ?? null,
            paymentStatus: s.payment_status,
            amountTotal: s.amount_total ?? 0,
            paymentIntentId: id(s.payment_intent),
            customerId: id(s.customer),
          },
        };
      }
      return { id: event.id, type: event.type };
    },

    async chargeSaved(input) {
      const deposit = await stripe.paymentIntents.retrieve(input.depositPaymentIntentId);
      const paymentMethod = typeof deposit.payment_method === "string" ? deposit.payment_method : deposit.payment_method?.id;
      if (!paymentMethod) return { ok: false, paymentIntentId: null, reason: "No saved card on the deposit payment" };
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: input.amount,
            currency: input.currency.toLowerCase(),
            customer: input.customerId,
            payment_method: paymentMethod,
            off_session: true,
            confirm: true,
            description: input.description,
            metadata: input.metadata,
          },
          { idempotencyKey: input.idempotencyKey },
        );
        return pi.status === "succeeded" ? { ok: true, paymentIntentId: pi.id } : { ok: false, paymentIntentId: pi.id, reason: `Payment ${pi.status}` };
      } catch (error) {
        if (error instanceof Stripe.errors.StripeCardError) {
          const pi = (error.raw as { payment_intent?: { id?: string } } | undefined)?.payment_intent?.id ?? null;
          return { ok: false, paymentIntentId: pi, reason: error.message };
        }
        throw error;
      }
    },

    async refund(paymentIntentId, amount, reason, idempotencyKey) {
      const r = await stripe.refunds.create({ payment_intent: paymentIntentId, amount, metadata: { reason } }, { idempotencyKey });
      return { id: r.id };
    },
  };
}

/**
 * Development only (PAYMENTS=fake): no Stripe account needed. Checkout goes to a
 * test page on the Worker whose Pay button sends the same event Stripe would.
 */
export function fakePayments(apiOrigin: string): Payments {
  return {
    name: "fake",
    async createCheckout(input) {
      const balance = input.metadata.kind === "balance";
      const id = `fake_cs_${balance ? "balance_" : ""}${input.bookingId}`;
      const q = new URLSearchParams({ success: input.successUrl, cancel: input.cancelUrl, amount: String(input.amount), currency: input.currency, what: input.description, kind: balance ? "balance" : "booking" });
      return { id, url: `${apiOrigin}/api/dev/checkout/${id}?${q}` };
    },
    async expireCheckout() {},
    async chargeSaved(input) {
      return { ok: true, paymentIntentId: `fake_pi_${input.idempotencyKey}` };
    },
    async parseWebhook(rawBody) {
      return JSON.parse(rawBody) as PaymentEvent;
    },
    async refund(_pi, _amount, _reason, key) {
      return { id: `fake_re_${key}` };
    },
  };
}
