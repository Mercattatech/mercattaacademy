import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const host = process.env.TEST_DB_HOST ?? "localhost:5432";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/setup/global.ts"],
    fileParallelism: false,
    env: {
      // O app de teste conecta como pos_app, igual à produção: RLS valendo.
      DATABASE_URL: `postgres://pos_app:pos_app_dev@${host}/pos_saas_test`,
      DATABASE_OWNER_URL: `postgres://pos_owner:pos_owner_dev@${host}/pos_saas_test`,
    },
  },
});
