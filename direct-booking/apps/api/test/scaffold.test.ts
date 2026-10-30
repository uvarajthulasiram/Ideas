import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { site } from "@direct-booking/sites/selected";

describe("scaffold", () => {
  it("serves health with the selected site and migrated D1 tables", async () => {
    const res = await exports.default.fetch("http://api.test/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      site: site.id,
      envSiteId: site.id,
      properties: site.properties.map((p) => p.id),
      currency: site.currency,
      tables: ["blocked_dates", "bookings", "d1_migrations", "manual_blocks", "nightly_rates", "sync_runs"],
    });
  });

  it("returns 404 for unknown routes", async () => {
    const res = await exports.default.fetch("http://api.test/nope");
    expect(res.status).toBe(404);
  });

  it("enforces booking constraints in the schema", async () => {
    const insert = (status: string, checkIn: string, checkOut: string, holdExpiresAt: number | null) =>
      env.DB.prepare(
        `INSERT INTO bookings (id, view_token, property_id, check_in, check_out, guests, status, hold_expires_at,
           guest_name, guest_email, quote, currency, created_at, updated_at)
         VALUES (?, 't', 'p', ?, ?, 2, ?, ?, 'Guest', 'g@example.com', '{}', 'USD', 0, 0)`,
      )
        .bind(crypto.randomUUID(), checkIn, checkOut, status, holdExpiresAt)
        .run();

    await expect(insert("hold", "2026-11-20", "2026-11-23", 1_800)).resolves.toBeTruthy();
    await expect(insert("pending", "2026-11-20", "2026-11-23", null)).rejects.toThrow(/CHECK/);
    await expect(insert("confirmed", "2026-11-23", "2026-11-20", null)).rejects.toThrow(/CHECK/);
    await expect(insert("hold", "2026-11-20", "2026-11-23", null)).rejects.toThrow(/CHECK/);
  });
});
