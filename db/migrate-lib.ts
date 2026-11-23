import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(__dirname, "migrations");

/**
 * Aplica, em ordem, os arquivos de db/migrations que ainda não rodaram.
 * Roda com o papel dono das tabelas (pos_owner) e com app.is_master = on,
 * porque as tabelas têm RLS forçado até para o dono.
 */
export async function runMigrations(ownerUrl: string, log: (msg: string) => void = console.log) {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    const applied = new Set(
      (await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
    );
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("begin");
      try {
        await client.query("select set_config('app.is_master', 'on', true)");
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        log(`aplicada ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Falha em ${file}: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}
