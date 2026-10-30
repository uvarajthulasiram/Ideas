import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the generated wrangler.jsonc (run `npm run types` first;
// `npm test` does it). Each test file gets a fresh local D1 with all migrations applied.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ICAL_EXPORT_TOKEN: "test-export-token",
          DEV_ORIGINS: "http://localhost:3000",
          SITE_ORIGIN: "http://localhost:3000",
          TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url))),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
