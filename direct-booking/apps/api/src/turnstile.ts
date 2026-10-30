// Turnstile Siteverify, the canonical check from the turnstile-spin skill:
// success, the expected action, and an approved frontend hostname. Fails closed.

export const CHECKOUT_ACTION = "checkout";

export interface Turnstile {
  verify(token: unknown, remoteIp: string | null): Promise<boolean>;
}

export function siteverify(secret: string | undefined, hostnamesCsv: string | undefined, fetcher: typeof fetch): Turnstile {
  const hostnames = new Set((hostnamesCsv ?? "").split(",").map((h) => h.trim()).filter(Boolean));
  return {
    async verify(token, remoteIp) {
      if (!secret || hostnames.size === 0) return false;
      if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
      try {
        const r = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          signal: AbortSignal.timeout(10_000),
          body: new URLSearchParams({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
        });
        if (!r.ok) return false;
        const result = (await r.json()) as { success?: boolean; action?: string; hostname?: string; metadata?: { result_with_testing_key?: boolean } };
        // Cloudflare's test keys return no action; only a test secret can produce that result.
        const actionOk = result.action === CHECKOUT_ACTION || (result.action === undefined && result.metadata?.result_with_testing_key === true);
        return result.success === true && actionOk && hostnames.has(result.hostname ?? "");
      } catch {
        return false;
      }
    },
  };
}
