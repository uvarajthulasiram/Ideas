// The booking API. Routes and cron jobs from PLAN.md arrive phase by phase;
// Phase 1 only proves the Worker reads the selected site and its D1 database.

import { SITE_ID, site } from "@direct-booking/sites/selected";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      const { results } = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name <> 'sqlite_sequence' ORDER BY name",
      ).all<{ name: string }>();
      return Response.json({
        ok: true,
        site: SITE_ID,
        envSiteId: env.SITE_ID,
        properties: site.properties.map((p) => p.id),
        currency: site.currency,
        tables: results.map((r) => r.name),
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(controller): Promise<void> {
    // */15 * * * *  iCal import and hold expiry (Phase 2)
    // 0 10 * * *    PriceLabs rates (Phase 3)
    // 0 17 * * *    balance charges (Phase 6)
    console.log(`Cron ${controller.cron}: not implemented yet`);
  },
} satisfies ExportedHandler<Env>;
