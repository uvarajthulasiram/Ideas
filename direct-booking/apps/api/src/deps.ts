// Outside services the Worker talks to. Routes and jobs receive them as `deps`
// so tests can swap in fakes; production builds them from env in realDeps().

import { site } from "@direct-booking/sites/selected";
import { bindingMailer, type Mailer } from "./email";
import { fakePayments, stripePayments, type Payments } from "./payments";
import { fixturePriceSource, pricelabsPriceSource, type PriceSource } from "./prices";
import { siteverify, type Turnstile } from "./turnstile";

export interface Deps {
  now: () => Date;
  /** Outbound HTTP (channel feeds). */
  fetch: typeof fetch;
  prices: PriceSource;
  payments: Payments;
  turnstile: Turnstile;
  mailer: Mailer;
}

/** Development shortcuts (fake payments, made-up prices) only work for a site on localhost. */
export function isLocalDev(env: Env): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.SITE_ORIGIN ?? "");
}

export function realDeps(env: Env, requestUrl?: string): Deps {
  const fetcher: typeof fetch = (input, init) => fetch(input, init);
  const local = isLocalDev(env);
  return {
    now: () => new Date(),
    fetch: fetcher,
    // PRICE_SOURCE=fixture and PAYMENTS=fake are set only in .dev.vars; production never sets them.
    prices: env.PRICE_SOURCE === "fixture" && local ? fixturePriceSource : pricelabsPriceSource(env.PRICELABS_API_KEY || undefined),
    payments:
      env.PAYMENTS === "fake" && local
        ? fakePayments(requestUrl ? new URL(requestUrl).origin : "http://localhost:8788")
        : lazy(() => stripePayments(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET)),
    turnstile: siteverify(env.TURNSTILE_SECRET || undefined, env.TURNSTILE_HOSTNAMES, fetcher),
    mailer: bindingMailer(env.EMAIL, site.emailFrom),
  };
}

/** Build Stripe only when first used, so routes that don't pay never need its keys. */
function lazy(make: () => Payments): Payments {
  let p: Payments | undefined;
  const get = () => (p ??= make());
  return {
    name: "stripe",
    createCheckout: (i) => get().createCheckout(i),
    expireCheckout: (id) => get().expireCheckout(id),
    parseWebhook: (b, s) => get().parseWebhook(b, s),
    refund: (pi, a, r, k) => get().refund(pi, a, r, k),
  };
}
