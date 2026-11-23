import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";
import { createCohortFromProgram } from "@/lib/services/academic";
import { applyAsaasEvent, startCheckout } from "@/lib/services/payments";
import { createTenant } from "@/lib/services/tenants";
import { decryptSecret, encryptSecret, safeEqual } from "@/lib/crypto";
import { parseCpf } from "@/lib/cpf";

process.env.PAYMENT_SECRET = "segredo-de-teste-bem-longo-123";

let alpha: string;
let beta: string;
let enrollmentId: string;
let installEnrollmentId: string;

const ctx = (tenantId: string, userId?: string) => ({ tenantId, userId });
let chargeSeq = 0;
const asaasCalls: { url: string; body: Record<string, unknown> | null }[] = [];

function mockAsaas() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      asaasCalls.push({ url, body });
      const json = (o: object) => new Response(JSON.stringify(o), { status: 200 });
      if (url.endsWith("/customers")) return json({ id: "cus_1" });
      if (url.endsWith("/payments")) {
        const n = ++chargeSeq;
        return json({ id: `pay_${n}`, status: "PENDING", invoiceUrl: `https://asaas.test/i/${n}`, dueDate: "2026-11-20", value: 1 });
      }
      return json({ balance: 0 });
    }),
  );
}

beforeAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.is_master', 'on', true)");
  await owner.query(`insert into "user" (id, name, email, "emailVerified") values
    ('m3', 'Master', 'master@s3.test', true),
    ('al1', 'Ana Aluna', 'ana@s3.test', true),
    ('al2', 'Davi Aluno', 'davi@s3.test', true)`);
  await owner.query("commit");
  await owner.end();

  const planId = (await pool.query("select id from plans limit 1")).rows[0].id;
  const created = await withContext({ master: true, userId: "m3" }, async (c) => ({
    a: await createTenant(c, { name: "Alpha 3", slug: "alpha3", planId, adminEmail: "admin@alpha3.test", actorId: "m3" }),
    b: await createTenant(c, { name: "Beta 3", slug: "beta3", planId, adminEmail: "admin@beta3.test", actorId: "m3" }),
  }));
  alpha = created.a.tenantId;
  beta = created.b.tenantId;

  await withContext(ctx(alpha), async (c) => {
    const programId = (await c.query(
      `insert into programs (tenant_id, name, status, price_cents, max_installments) values ($1, 'Curso Pago', 'published', 120000, 6) returning id`, [alpha],
    )).rows[0].id;
    const cohort = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "T1", startsOn: null, endsOn: null });
    await c.query("update cohorts set status = 'open' where id = $1", [cohort]);
    for (const [uid, key] of [["al1", "e1"], ["al2", "e2"]] as const) {
      const id = (await c.query(
        `insert into enrollments (tenant_id, cohort_id, user_id, source, stage) values ($1, $2, $3, 'vitrine', 'payment') returning id`, [alpha, cohort, uid],
      )).rows[0].id;
      if (key === "e1") enrollmentId = id; else installEnrollmentId = id;
    }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  asaasCalls.length = 0;
});
afterAll(async () => {
  await pool.end();
});

describe("cofre e CPF", () => {
  it("cifra e decifra a chave, e cada cifra é diferente", () => {
    const a = encryptSecret("$aact_chave_secreta");
    expect(a).not.toContain("aact");
    expect(decryptSecret(a)).toBe("$aact_chave_secreta");
    expect(encryptSecret("$aact_chave_secreta")).not.toBe(a);
    expect(() => decryptSecret(a.slice(0, -4) + "AAAA")).toThrow();
  });
  it("compara tokens sem vazar tamanho", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("valida CPF", () => {
    expect(parseCpf("529.982.247-25")).toBe("52998224725");
    expect(parseCpf("111.111.111-11")).toBeNull();
    expect(parseCpf("529.982.247-24")).toBeNull();
    expect(parseCpf("123")).toBeNull();
  });
});

describe("cobrança", () => {
  it("sem Asaas configurado, avisa e não cobra", async () => {
    mockAsaas();
    const r = await startCheckout({ tenantId: alpha, userId: "al1", enrollmentId, cpf: "52998224725", installments: 1 });
    expect(r).toEqual({ ok: false, error: "not_configured" });
    expect(asaasCalls).toHaveLength(0);
  });

  it("gera cobrança à vista na conta da instituição e reaproveita a que está em aberto", async () => {
    await withContext(ctx(alpha), (c) =>
      c.query("insert into payment_settings (tenant_id, api_key_enc, environment, webhook_token) values ($1, $2, 'sandbox', 'tok-alpha')", [alpha, encryptSecret("$aact_alpha")]),
    );
    mockAsaas();
    const first = await startCheckout({ tenantId: alpha, userId: "al1", enrollmentId, cpf: "52998224725", installments: 1 });
    expect(first).toEqual({ ok: true, invoiceUrl: "https://asaas.test/i/1", reused: false });
    const charge = asaasCalls.find((c) => c.url.endsWith("/payments"))!;
    expect(charge.body).toMatchObject({ value: 1200, billingType: "UNDEFINED", externalReference: enrollmentId });
    const customer = asaasCalls.find((c) => c.url.endsWith("/customers"))!;
    expect(customer.body).toMatchObject({ cpfCnpj: "52998224725", email: "ana@s3.test" });
    const again = await startCheckout({ tenantId: alpha, userId: "al1", enrollmentId, cpf: "52998224725", installments: 1 });
    expect(again).toEqual({ ok: true, invoiceUrl: "https://asaas.test/i/1", reused: true });
    expect(asaasCalls.filter((c) => c.url.endsWith("/payments"))).toHaveLength(1);
    // o CPF não fica no banco
    const stored = await withContext(ctx(alpha), async (c) => (await c.query("select * from payment_customers")).rows);
    expect(JSON.stringify(stored)).not.toContain("52998224725");
  });

  it("parcelado: valida o máximo do curso e envia total e quantidade", async () => {
    mockAsaas();
    const bad = await startCheckout({ tenantId: alpha, userId: "al2", enrollmentId: installEnrollmentId, cpf: "52998224725", installments: 7 });
    expect(bad).toEqual({ ok: false, error: "bad_installments" });
    const ok = await startCheckout({ tenantId: alpha, userId: "al2", enrollmentId: installEnrollmentId, cpf: "52998224725", installments: 6 });
    expect(ok).toMatchObject({ ok: true });
    expect(asaasCalls.find((c) => c.url.endsWith("/payments"))!.body).toMatchObject({ installmentCount: 6, totalValue: 1200 });
  });

  it("aluno não cobra a inscrição de outra pessoa", async () => {
    mockAsaas();
    const r = await startCheckout({ tenantId: alpha, userId: "al1", enrollmentId: installEnrollmentId, cpf: "52998224725", installments: 1 });
    expect(r).toEqual({ ok: false, error: "not_in_payment" });
  });

  it("erro do Asaas volta como mensagem e não deixa cobrança pela metade", async () => {
    await withContext(ctx(alpha), (c) => c.query("delete from payments where enrollment_id = $1", [installEnrollmentId]));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ description: "CPF inválido" }] }), { status: 400 })));
    const r = await startCheckout({ tenantId: alpha, userId: "al2", enrollmentId: installEnrollmentId, cpf: "52998224725", installments: 1 });
    expect(r).toEqual({ ok: false, error: "asaas", message: "CPF inválido" });
    const n = await withContext(ctx(alpha), async (c) => (await c.query("select count(*)::int as n from payments where enrollment_id = $1", [installEnrollmentId])).rows[0].n);
    expect(n).toBe(0);
  });
});

describe("webhook", () => {
  const event = (name: string, extra: object = {}) => ({
    event: name,
    payment: { id: "pay_1", value: 1200, externalReference: "", installmentNumber: 1, ...extra },
  });

  it("ignora evento desconhecido, inscrição inexistente e referência inválida", async () => {
    const run = (b: object) => withContext(ctx(alpha), (c) => applyAsaasEvent(c, alpha, b));
    expect(await run({ event: "PAYMENT_CREATED", payment: { id: "x", externalReference: enrollmentId } })).toEqual({ handled: false });
    expect(await run(event("PAYMENT_RECEIVED", { externalReference: "00000000-0000-0000-0000-000000000000" }))).toEqual({ handled: false });
    expect(await run(event("PAYMENT_RECEIVED", { externalReference: "'; drop table x" }))).toEqual({ handled: false });
  });

  it("pagamento confirmado libera o acesso, avisa o aluno, e repetir não duplica", async () => {
    const run = () => withContext(ctx(alpha), (c) => applyAsaasEvent(c, alpha, event("PAYMENT_RECEIVED", { externalReference: enrollmentId })));
    const first = await run();
    expect(first.released).toMatchObject({ email: "ana@s3.test", program: "Curso Pago" });
    const second = await run();
    expect(second).toEqual({ handled: true });
    const state = await withContext(ctx(alpha), async (c) => ({
      stage: (await c.query("select stage from enrollments where id = $1", [enrollmentId])).rows[0].stage,
      pay: (await c.query("select status, paid_at is not null as paid from payments where asaas_id = 'pay_1'")).rows,
      notices: (await c.query("select count(*)::int as n from notifications where user_id = 'al1' and kind = 'access_released'")).rows[0].n,
      audit: (await c.query("select count(*)::int as n from audit_log where action = 'access_released_by_payment'")).rows[0].n,
    }));
    expect(state).toEqual({ stage: "released", pay: [{ status: "confirmed", paid: true }], notices: 1, audit: 1 });
  });

  it("parcelado: libera na primeira parcela; a segunda só atualiza o histórico", async () => {
    const run = (id: string, no: number, ev = "PAYMENT_CONFIRMED") =>
      withContext(ctx(alpha), (c) => applyAsaasEvent(c, alpha, { event: ev, payment: { id, value: 200, externalReference: installEnrollmentId, installmentNumber: no } }));
    expect((await run("p_a1", 1, "PAYMENT_CREATED")).handled).toBe(false);
    const out = await run("p_a1", 1);
    expect(out.released).toBeDefined();
    expect((await run("p_a2", 2)).released).toBeUndefined();
    await run("p_a3", 3, "PAYMENT_OVERDUE");
    const rows = await withContext(ctx(alpha), async (c) => ({
      pay: (await c.query("select installment_no, status from payments where enrollment_id = $1 order by installment_no", [installEnrollmentId])).rows,
      stage: (await c.query("select stage from enrollments where id = $1", [installEnrollmentId])).rows[0].stage,
    }));
    expect(rows.pay).toEqual([{ installment_no: 1, status: "confirmed" }, { installment_no: 2, status: "confirmed" }, { installment_no: 3, status: "overdue" }]);
    expect(rows.stage).toBe("released");
  });

  it("atraso e estorno de parcela não tiram o acesso", async () => {
    await withContext(ctx(alpha), (c) => applyAsaasEvent(c, alpha, { event: "PAYMENT_REFUNDED", payment: { id: "p_a1", value: 200, externalReference: installEnrollmentId, installmentNumber: 1 } }));
    const stage = await withContext(ctx(alpha), async (c) => (await c.query("select stage from enrollments where id = $1", [installEnrollmentId])).rows[0].stage);
    expect(stage).toBe("released");
  });
});

describe("isolamento", () => {
  it("chave e cobranças de uma instituição não aparecem na outra", async () => {
    const seen = await withContext(ctx(beta), async (c) => ({
      settings: (await c.query("select count(*)::int as n from payment_settings")).rows[0].n,
      payments: (await c.query("select count(*)::int as n from payments")).rows[0].n,
      customers: (await c.query("select count(*)::int as n from payment_customers")).rows[0].n,
    }));
    expect(seen).toEqual({ settings: 0, payments: 0, customers: 0 });
  });
  it("webhook da instituição B não mexe em inscrição da A", async () => {
    const out = await withContext(ctx(beta), (c) =>
      applyAsaasEvent(c, beta, { event: "PAYMENT_RECEIVED", payment: { id: "pay_x", value: 10, externalReference: enrollmentId } }),
    );
    expect(out).toEqual({ handled: false });
  });
});
