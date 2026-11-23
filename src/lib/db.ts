import { Pool, types, type PoolClient } from "pg";

// Colunas "date" (dia sem hora) chegam como texto AAAA-MM-DD, sem conversão de fuso.
types.setTypeParser(1082, (value) => value);

/**
 * Pool do app. Conecta com o papel `pos_app`, que NÃO é dono das tabelas
 * e NÃO tem BYPASSRLS: toda leitura e escrita passa pelas políticas RLS.
 */
const globalForPool = globalThis as unknown as { __posPool?: Pool };

export const pool =
  globalForPool.__posPool ??
  new Pool({
    // Na Vercel, aponte para o PgBouncer da VPS (modo transaction) com sslmode=require.
    // withContext usa set_config(..., true), que vale só na transação: compatível com PgBouncer.
    connectionString: process.env.DATABASE_URL,
    // Funções serverless abrem muitas instâncias; poucas conexões por instância.
    max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForPool.__posPool = pool;

export type DbContext = {
  /** Instituição da requisição. Sem ela, o RLS não devolve nenhuma linha de dados de instituição. */
  tenantId?: string | null;
  /** Usuário autenticado (id do Better Auth). */
  userId?: string | null;
  /** Só o painel master usa. Decidido no servidor a partir de `platform_admins`, nunca do cliente. */
  master?: boolean;
};

/**
 * Executa `fn` numa transação com o contexto da requisição gravado em
 * `app.tenant_id`, `app.user_id` e `app.is_master` (válidos só nesta transação).
 * É a ÚNICA forma permitida de consultar tabelas de instituição.
 */
export async function withContext<T>(
  ctx: DbContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `select set_config('app.tenant_id', $1, true),
              set_config('app.user_id',   $2, true),
              set_config('app.is_master', $3, true)`,
      [ctx.tenantId ?? "", ctx.userId ?? "", ctx.master ? "on" : "off"],
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
