// Outside services the Worker talks to. Routes and jobs receive them as `deps`
// so tests can swap in fakes; production builds them from env in realDeps().

import { fixturePriceSource, pricelabsPriceSource, type PriceSource } from "./prices";

export interface Deps {
  now: () => Date;
  /** Outbound HTTP (channel feeds). */
  fetch: typeof fetch;
  prices: PriceSource;
}

export function realDeps(env: Env): Deps {
  return {
    now: () => new Date(),
    fetch: (input, init) => fetch(input, init),
    // PRICE_SOURCE=fixture is set only in .dev.vars; production never sets it.
    prices: env.PRICE_SOURCE === "fixture" ? fixturePriceSource : pricelabsPriceSource(env.PRICELABS_API_KEY || undefined),
  };
}
