import "dotenv/config";
import { Client } from "pg";

/**
 * Dados de desenvolvimento: usuário master da plataforma, a instituição
 * Bressane com o administrador dela e os recursos opcionais desligados.
 * Pode rodar várias vezes (não duplica).
 */
async function main() {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  const masterEmail = process.env.MASTER_EMAIL ?? "master@plataforma.local";
  const masterPassword = process.env.MASTER_PASSWORD ?? "trocar-esta-senha";
  if (!ownerUrl) throw new Error("Defina DATABASE_OWNER_URL no .env");

  const { auth } = await import("../src/lib/auth");
  const { pool } = await import("../src/lib/db");

  const masterId = await ensureUser(auth, "Master da plataforma", masterEmail, masterPassword);
  const bressaneAdminId = await ensureUser(auth, "Admin Bressane", "admin@bressane.local", masterPassword);

  const db = new Client({ connectionString: ownerUrl });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('app.is_master', 'on', true)");
    await db.query("insert into platform_admins (user_id) values ($1) on conflict do nothing", [masterId]);

    const plan = await db.query<{ id: string }>("select id from plans where active order by created_at limit 1");
    const tenant = await db.query<{ id: string }>(
      `insert into tenants (slug, name, plan_id, brand, links)
       values ('bressane', 'Instituto Bressane', $1, $2, $3)
       on conflict (slug) do update set name = excluded.name
       returning id`,
      [plan.rows[0].id, { primary: "#1f4e79" }, { site: "https://example.com" }],
    );
    const tenantId = tenant.rows[0].id;

    await db.query(
      `insert into subscriptions (tenant_id, plan_id) values ($1, $2) on conflict (tenant_id) do nothing`,
      [tenantId, plan.rows[0].id],
    );
    await db.query(
      `insert into memberships (tenant_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing`,
      [tenantId, bressaneAdminId],
    );
    await db.query(
      `insert into tenant_labels (tenant_id, label_key, singular, plural) values
         ($1, 'program', 'Pós-graduação', 'Pós-graduações'),
         ($1, 'cohort',  'Turma',         'Turmas'),
         ($1, 'module',  'Módulo',        'Módulos'),
         ($1, 'lesson',  'Aula',          'Aulas')
       on conflict do nothing`,
      [tenantId],
    );
    // Opcionais desligados para a Bressane (registro explícito, para o painel master listar).
    await db.query(
      `insert into tenant_features (tenant_id, feature_key, enabled)
       select $1, key, false from features where kind = 'optional'
       on conflict do nothing`,
      [tenantId],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
    await pool.end();
  }

  console.log("Seed pronto.");
  console.log(`  Master:          ${masterEmail}`);
  console.log("  Admin Bressane:  admin@bressane.local");
  console.log("  Senha de ambos:  a de MASTER_PASSWORD no .env");
}

async function ensureUser(
  auth: typeof import("../src/lib/auth").auth,
  name: string,
  email: string,
  password: string,
): Promise<string> {
  const { pool } = await import("../src/lib/db");
  const existing = await pool.query<{ id: string }>(`select id from "user" where email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const result = await auth.api.signUpEmail({ body: { name, email, password } });
  return result.user.id;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
