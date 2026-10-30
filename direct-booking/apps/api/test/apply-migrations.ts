import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Every test starts from empty tables.
beforeEach(async () => {
  await env.DB.batch(
    ["blocked_dates", "bookings", "nightly_rates", "manual_blocks", "sync_runs", "sqlite_sequence"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});
