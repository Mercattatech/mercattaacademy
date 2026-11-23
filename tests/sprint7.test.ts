import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";
import { checkEnv, hasErrors } from "@/lib/env";
import { exportMyData } from "@/lib/services/privacy";
import { createCohortFromProgram } from "@/lib/services/academic";
import { openThread } from "@/lib/services/support";
import { createTenant } from "@/lib/services/tenants";
import nextConfig, { securityHeaders } from "../next.config";
import { GET as health } from "@/app/api/health/route";

const good = {
  NODE_ENV: "production", DATABASE_URL: "postgres://pos_app:Zk3pQ9vL2xW8nB5mC7dR1tY4uH6jF0aS@db.interno.plataforma.com.br:5432/pos",
  ROOT_DOMAIN: "plataforma.com.br", BETTER_AUTH_URL: "https://plataforma.com.br", BETTER_AUTH_SECRET: "k7Hq2VnP9xLm4Rt8Wc1Zb6Yd3Fj5Gs0A",
  PAYMENT_SECRET: "Qe4Tn8Wz1Xk6Lp3Rv9Yb2Hc7Md5Fg0Js", RESEND_API_KEY: "re_abc", EMAIL_FROM: "nao-responda@plataforma.com.br",
  S3_ENDPOINT: "https://minio.plataforma.com.br", DAILY_API_KEY: "d", DAILY_WEBHOOK_SECRET: "w",
};
const keysOf = (env: Record<string, string | undefined>, level?: "error" | "warning") => checkEnv(env).filter((i) => !level || i.level === level).map((i) => i.key).sort();

describe("verificação do ambiente", () => {
  it("ambiente de produção completo não tem problema", () => {
    expect(checkEnv(good)).toEqual([]);
  });
  it("segredo de exemplo, curto ou ausente é erro", () => {
    expect(keysOf({ ...good, BETTER_AUTH_SECRET: "troque-por-um-segredo-longo-xxxxxxxxxxxxxxxx" }, "error")).toEqual(["BETTER_AUTH_SECRET"]);
    expect(keysOf({ ...good, PAYMENT_SECRET: "curto" }, "error")).toEqual(["PAYMENT_SECRET"]);
    expect(keysOf({ ...good, PAYMENT_SECRET: undefined }, "error")).toEqual(["PAYMENT_SECRET"]);
  });
  it("em produção exige https, domínio real, senha do banco real e S3", () => {
    expect(keysOf({ ...good, BETTER_AUTH_URL: "http://plataforma.com.br" }, "error")).toEqual(["BETTER_AUTH_URL"]);
    expect(keysOf({ ...good, ROOT_DOMAIN: "localhost:3000" }, "error")).toEqual(["ROOT_DOMAIN"]);
    expect(keysOf({ ...good, DATABASE_URL: "postgres://pos_app:pos_app_dev@localhost/pos" }, "error")).toEqual(["DATABASE_URL"]);
    expect(keysOf({ ...good, S3_ENDPOINT: undefined }, "error")).toEqual(["S3_ENDPOINT"]);
  });
  it("e-mail e Daily sem configurar são só aviso, exceto Daily sem segredo do webhook", () => {
    expect(keysOf({ ...good, RESEND_API_KEY: undefined }, "warning")).toEqual(["RESEND_API_KEY"]);
    expect(keysOf({ ...good, DAILY_API_KEY: undefined, DAILY_WEBHOOK_SECRET: undefined }, "warning")).toEqual(["DAILY_API_KEY"]);
    expect(hasErrors(checkEnv({ ...good, DAILY_WEBHOOK_SECRET: undefined }))).toBe(true);
    expect(hasErrors(checkEnv({ ...good, RESEND_API_KEY: undefined }))).toBe(false);
  });
  it("em desenvolvimento só os segredos obrigatórios contam", () => {
    const dev = { NODE_ENV: "development", DATABASE_URL: "postgres://x", ROOT_DOMAIN: "localhost:3000", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "k7Hq2VnP9xLm4Rt8Wc1Zb6Yd3Fj5Gs0A", PAYMENT_SECRET: "Qe4Tn8Wz1Xk6Lp3Rv9Yb2Hc7Md5Fg0Js" };
    expect(checkEnv(dev)).toEqual([]);
  });
});

describe("cabeçalhos de segurança", () => {
  it("saem em todas as rotas, com câmera e microfone só para a plataforma e a sala de vídeo", async () => {
    const rules = await nextConfig.headers!();
    expect(rules[0].source).toBe("/:path*");
    const map = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["Permissions-Policy"]).toContain('camera=(self "https://*.daily.co")');
    expect(map["Permissions-Policy"]).toContain("geolocation=()");
    expect(securityHeaders.some((h) => h.key === "Strict-Transport-Security")).toBe(process.env.NODE_ENV === "production");
  });
});

describe("health check", () => {
  it("responde sem detalhes e com 503 quando a configuração tem erro grave", async () => {
    const saved = { s: process.env.PAYMENT_SECRET };
    const ok = await health();
    const body = await ok.json();
    expect(Object.keys(body).sort()).toEqual(["config", "db", "status"]);
    expect(body.db).toBe(true);
    process.env.PAYMENT_SECRET = "curto";
    const bad = await health();
    expect(bad.status).toBe(503);
    expect((await bad.json()).status).toBe("falha");
    process.env.PAYMENT_SECRET = saved.s;
  });
});

let alpha: string;
let beta: string;
const ctx = (tenantId: string, userId?: string) => ({ tenantId, userId });

describe("exportação dos meus dados (LGPD)", () => {
  beforeAll(async () => {
    const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
    await owner.connect();
    await owner.query("begin");
    await owner.query("select set_config('app.is_master', 'on', true)");
    await owner.query(`insert into "user" (id, name, email, "emailVerified") values
      ('p7m', 'Master', 'master@p7.test', true), ('p7a', 'Ana Titular', 'ana@p7.test', true), ('p7b', 'Beto Outro', 'beto@p7.test', true)`);
    await owner.query("commit");
    await owner.end();
    const planId = (await pool.query("select id from plans limit 1")).rows[0].id;
    const created = await withContext({ master: true, userId: "p7m" }, async (c) => ({
      a: await createTenant(c, { name: "Alpha 7", slug: "alpha7", planId, adminEmail: "admin@alpha7.test", actorId: "p7m" }),
      b: await createTenant(c, { name: "Beta 7", slug: "beta7", planId, adminEmail: "admin@beta7.test", actorId: "p7m" }),
    }));
    alpha = created.a.tenantId;
    beta = created.b.tenantId;
    await withContext(ctx(alpha), async (c) => {
      const programId = (await c.query(`insert into programs (tenant_id, name, status) values ($1, 'Curso 7', 'published') returning id`, [alpha])).rows[0].id;
      await c.query(`insert into program_modules (tenant_id, program_id, position, name) values ($1, $2, 1, 'M1')`, [alpha, programId]);
      const cohort = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma 7", startsOn: null, endsOn: null });
      for (const u of ["p7a", "p7b"]) {
        await c.query("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'aluno')", [alpha, u]);
        await c.query(`insert into enrollments (tenant_id, cohort_id, user_id, source, stage) values ($1, $2, $3, 'vitrine', 'released')`, [alpha, cohort, u]);
      }
      await openThread(c, { tenantId: alpha, userId: "p7a", userName: "Ana Titular", subject: "Dúvida da Ana", body: "Mensagem privada da Ana" });
      await openThread(c, { tenantId: alpha, userId: "p7b", userName: "Beto Outro", subject: "Dúvida do Beto", body: "Mensagem privada do Beto" });
      await c.query(`insert into notifications (tenant_id, user_id, kind, message) values ($1, 'p7b', 'x', 'Aviso só do Beto')`, [alpha]);
    });
  });
  afterAll(async () => { await pool.end(); });

  it("traz os dados da própria pessoa e nada de outras", async () => {
    const data = await withContext(ctx(alpha, "p7a"), (c) => exportMyData(c, "p7a", "Alpha 7"));
    expect(data.instituicao).toBe("Alpha 7");
    expect(data.perfil).toMatchObject({ name: "Ana Titular", email: "ana@p7.test" });
    expect(data.inscricoes).toHaveLength(1);
    expect(data.inscricoes[0]).toMatchObject({ curso: "Curso 7", turma: "Turma 7" });
    expect((data.atendimento as { texto: string }[]).map((m) => m.texto)).toEqual(["Mensagem privada da Ana"]);
    const json = JSON.stringify(data);
    expect(json).not.toContain("Beto");
    expect(json).not.toContain("beto@p7.test");
    expect(json).not.toContain("Aviso só do Beto");
  });
  it("não vaza nada de outra instituição e os campos de arquivos não trazem conteúdo", async () => {
    const other = await withContext(ctx(beta, "p7a"), (c) => exportMyData(c, "p7a", "Beta 7"));
    expect(other.inscricoes).toEqual([]);
    expect(other.atendimento).toEqual([]);
    expect(other.perfis_de_acesso).toEqual([]);
    const keys = new Set(Object.keys(await withContext(ctx(alpha, "p7a"), (c) => exportMyData(c, "p7a", "Alpha 7"))));
    expect(keys.has("documentos_enviados")).toBe(true);
    expect(JSON.stringify([...keys])).not.toMatch(/storage_key|password|senha/i);
  });
});
