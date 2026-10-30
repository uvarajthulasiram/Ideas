// Small HTTP helpers shared by the routes.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, { ...init, headers: { "cache-control": "no-store", ...init.headers } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  console.error(error);
  return json({ error: "internal", message: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_json", "Request body must be JSON.");
  }
}

/**
 * CORS for the guest site. In production the Worker is routed on the site's own
 * domain (same origin); during development the site runs on another port.
 */
export function withCors(request: Request, response: Response, allowedOrigins: string[]): Response {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "86400");
  headers.append("vary", "origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export function randomToken(bytes = 24): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
