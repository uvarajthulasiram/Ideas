// Admin routes sit behind Cloudflare Access (PLAN.md, Phase 6). Access adds a
// signed JWT to every request it lets through; the Worker checks it too, so a
// misconfigured route can't expose the admin API. RS256 against the team's
// published keys, with audience, issuer and expiry checks.

import { isLocalDev } from "./deps";
import { HttpError } from "./http";

interface Jwk extends JsonWebKey {
  kid: string;
}

let certCache: { team: string; keys: Jwk[]; at: number } | undefined;
const CERT_TTL_MS = 10 * 60 * 1000;

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlDecode(s))) as Record<string, unknown>;

async function keysFor(team: string, fetcher: typeof fetch, now: number): Promise<Jwk[]> {
  if (certCache && certCache.team === team && now - certCache.at < CERT_TTL_MS) return certCache.keys;
  const res = await fetcher(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  certCache = { team, keys, at: now };
  return keys;
}

export function clearAccessCache() {
  certCache = undefined;
}

/** The signed-in admin's email. Throws 403 unless the Access JWT is valid. */
export async function requireAdmin(request: Request, env: Env, fetcher: typeof fetch, now: Date): Promise<string> {
  const team = env.ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) {
    // Without Access configured, only a localhost development setup may use admin routes.
    if (isLocalDev(env)) return "dev@localhost";
    throw new HttpError(403, "forbidden", "Admin access is not configured.");
  }
  const deny = () => new HttpError(403, "forbidden", "Not signed in.");
  const token = request.headers.get("cf-access-jwt-assertion");
  const parts = token?.split(".");
  if (!parts || parts.length !== 3) throw deny();
  try {
    const header = decodeJson(parts[0]!);
    const payload = decodeJson(parts[1]!);
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw deny();
    const jwk = (await keysFor(team, fetcher, now.getTime())).find((k) => k.kid === header.kid);
    if (!jwk) throw deny();
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlDecode(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const seconds = now.getTime() / 1000;
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (
      !ok ||
      !auds.includes(aud) ||
      payload.iss !== `https://${team}` ||
      typeof payload.exp !== "number" ||
      payload.exp < seconds ||
      (typeof payload.nbf === "number" && payload.nbf > seconds + 60) ||
      typeof payload.email !== "string"
    ) {
      throw deny();
    }
    return payload.email;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw deny();
  }
}
