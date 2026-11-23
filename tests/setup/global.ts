import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { runMigrations } from "../../db/migrate-lib";

/**
 * Cria do zero o banco pos_saas_test e aplica todas as migrations.
 * Precisa de um superusuário (TEST_SUPERUSER_URL) só para criar papéis e o banco.
 */
export default async function setup() {
  const host = process.env.TEST_DB_HOST ?? "localhost:5432";
  const superUrl = process.env.TEST_SUPERUSER_URL ?? `postgres://postgres@${host}/postgres`;

  const admin = new Client({ connectionString: superUrl });
  await admin.connect();
  try {
    await admin.query(readFileSync(join(__dirname, "../../db/setup/roles.sql"), "utf8"));
    await admin.query("drop database if exists pos_saas_test with (force)");
    await admin.query("create database pos_saas_test owner pos_owner");
  } finally {
    await admin.end();
  }

  await runMigrations(`postgres://pos_owner:pos_owner_dev@${host}/pos_saas_test`, () => {});
}
