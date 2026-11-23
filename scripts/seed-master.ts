import "dotenv/config";
import { Client } from "pg";

/**
 * Cria SÓ a conta master da plataforma (produção). Não cria instituição nem
 * dados de demonstração (para isso existe `npm run db:seed`, só para dev).
 * Pode rodar de novo: se o e-mail já existe, só garante o papel de master.
 *
 *   MASTER_EMAIL=voce@empresa.com.br MASTER_PASSWORD='senha longa' npm run seed:master
 *
 * Variáveis: DATABASE_URL (pos_app), DATABASE_OWNER_URL (pos_owner),
 * BETTER_AUTH_SECRET e BETTER_AUTH_URL, iguais às de produção.
 * Da sua máquina, aponte as duas conexões para o túnel SSH (ver docs/DEPLOY.md).
 */
async function main() {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  const email = process.env.MASTER_EMAIL?.trim().toLowerCase();
  const password = process.env.MASTER_PASSWORD;
  const name = process.env.MASTER_NAME?.trim() || "Administrador da plataforma";

  if (!ownerUrl) throw new Error("Defina DATABASE_OWNER_URL.");
  if (!email || !email.includes("@") || email.endsWith(".local")) throw new Error("Defina MASTER_EMAIL com um e-mail real (não pode terminar em .local).");
  if (!password || password.length < 12 || password === "trocar-esta-senha") throw new Error("Defina MASTER_PASSWORD com 12 caracteres ou mais (não use a senha de exemplo).");

  const { auth } = await import("../src/lib/auth");
  const { pool } = await import("../src/lib/db");

  const db = new Client({ connectionString: ownerUrl });
  await db.connect();
  try {
    const existing = await pool.query<{ id: string }>(`select id from "user" where email = $1`, [email]);
    const userId = existing.rows[0]?.id ?? (await auth.api.signUpEmail({ body: { name, email, password } })).user.id;
    const created = !existing.rows[0];

    await db.query("begin");
    await db.query("select set_config('app.is_master', 'on', true)");
    await db.query("insert into platform_admins (user_id) values ($1) on conflict do nothing", [userId]);
    await db.query("commit");

    console.log(created ? `Conta master criada: ${email}` : `${email} já existia; papel de master garantido (a senha não foi alterada).`);
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
