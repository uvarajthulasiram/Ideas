import type { Deps } from "../src/deps";
import { fixturePriceSource, type PriceSource } from "../src/prices";

/** Deps with a fixed clock and canned responses for outbound fetches, keyed by URL. */
export function testDeps(options: { now?: string; responses?: Record<string, Response | (() => Response)>; prices?: PriceSource } = {}): Deps & { fetched: string[] } {
  const fetched: string[] = [];
  const now = new Date(options.now ?? "2026-11-01T18:00:00Z");
  return {
    fetched,
    now: () => now,
    prices: options.prices ?? fixturePriceSource,
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
