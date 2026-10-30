// The booking API: routes from PLAN.md, plus the cron jobs.

import { SITE_ID, site } from "@direct-booking/sites/selected";
import { findProperty } from "@direct-booking/core";
import { availability, parseRange, quoteFromDb } from "./availability";
import { checkout, devCheckoutAction, devCheckoutPage, getBookingRoute, releaseRoute, stripeWebhook } from "./checkout";
import { expireHolds, exportCalendar, exportToken, importCalendars } from "./calendars";
import { realDeps, type Deps } from "./deps";
import { HttpError, errorResponse, json, readJson, safeEqual, withCors } from "./http";
import { refreshRates } from "./prices";
import { QuoteBody, parseBody } from "./schemas";

export const CRONS = {
  calendars: "*/15 * * * *",
  prices: "0 10 * * *",
  balances: "0 17 * * *",
} as const;

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const { method } = request;
  let m: RegExpExecArray | null;

  if (method === "GET" && url.pathname === "/api/health") {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name <> 'sqlite_sequence' ORDER BY name",
    ).all<{ name: string }>();
    return json({
      ok: true,
      site: SITE_ID,
      envSiteId: env.SITE_ID,
      properties: site.properties.map((p) => p.id),
      currency: site.currency,
      tables: results.map((r) => r.name),
    });
  }

  if (method === "GET" && url.pathname === "/api/availability") {
    const property = propertyOr404(url.searchParams.get("property"));
    const { from, to } = parseRange(url.searchParams.get("from"), url.searchParams.get("to"));
    const nights = await availability(env.DB, property, from, to, deps.now());
    return json({ property: property.id, from, to, nights });
  }

  if (method === "POST" && url.pathname === "/api/quote") {
    const body = parseBody(QuoteBody, await readJson(request));
    const property = propertyOr404(body.property);
    const result = await quoteFromDb(env.DB, site, property, body, deps.now());
    if (!result.ok) throw new HttpError(422, result.error.code, result.error.message, result.error);
    return json({ quote: result.quote });
  }

  if (method === "POST" && url.pathname === "/api/checkout") {
    return checkout(request, env, deps, (id) => propertyOr404(id));
  }

  if (method === "POST" && url.pathname === "/api/stripe/webhook") {
    return stripeWebhook(request, env, deps);
  }

  if ((m = /^\/api\/booking\/(bk_[A-Za-z0-9_-]+)(\/release)?$/.exec(url.pathname))) {
    if (method === "GET" && !m[2]) return getBookingRoute(env, m[1]!, url.searchParams.get("t"));
    if (method === "POST" && m[2]) return releaseRoute(env, deps, m[1]!, url.searchParams.get("t"));
  }

  if (deps.payments.name === "fake" && (m = /^\/api\/dev\/checkout\/(fake_cs_[A-Za-z0-9_-]+)$/.exec(url.pathname))) {
    if (method === "GET") return devCheckoutPage(url);
    if (method === "POST") return devCheckoutAction(request, url, env, deps, m[1]!);
  }

  if (method === "GET" && (m = /^\/ical\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)\.ics$/.exec(url.pathname))) {
    const property = site.properties.find((p) => p.id === m![1]);
    if (!property || !env.ICAL_EXPORT_TOKEN || !safeEqual(m[2]!, await exportToken(env.ICAL_EXPORT_TOKEN, property.id))) {
      throw new HttpError(404, "not_found", "Not found.");
    }
    const body = await exportCalendar(env.DB, site.id, property, deps.now());
    return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
  }

  throw new HttpError(404, "not_found", "Not found.");
}

export async function runCron(cron: string, env: Env, deps: Deps): Promise<void> {
  switch (cron) {
    case CRONS.calendars: {
      for (const property of site.properties) {
        const result = await importCalendars(env.DB, property, deps);
        if (!result.ok) console.error(`iCal import ${property.id}`, JSON.stringify(result.channels));
      }
      await expireHolds(env.DB, deps.now());
      return;
    }
    case CRONS.prices: {
      for (const property of site.properties) {
        const result = await refreshRates(env.DB, property, site.currency, deps.prices, deps);
        if (!result.ok) console.error(`Price fetch ${property.id}: ${result.error}`);
      }
      return;
    }
    default:
      console.log(`Cron ${cron}: nothing scheduled`);
  }
}

function propertyOr404(idOrSlug: string | null) {
  const property = idOrSlug ? findProperty(site, idOrSlug) : undefined;
  if (!property) throw new HttpError(404, "unknown_property", "No such property.");
  return property;
}

function allowedOrigins(env: Env): string[] {
  const origins = (env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (site.domain) origins.push(`https://${site.domain}`);
  return origins;
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === "OPTIONS") return withCors(request, new Response(null, { status: 204 }), allowedOrigins(env));
    let response: Response;
    try {
      response = await handle(request, env, realDeps(env, request.url));
    } catch (error) {
      response = errorResponse(error);
    }
    return withCors(request, response, allowedOrigins(env));
  },

  async scheduled(controller, env): Promise<void> {
    await runCron(controller.cron, env, realDeps(env));
  },
} satisfies ExportedHandler<Env>;
