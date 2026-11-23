import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("sem chave do Resend, não envia (desenvolvimento)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendEmail({ to: "a@b.test", subject: "Oi", html: "<p>Oi</p>" });

    expect(result).toEqual({ id: "dev", delivered: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia com o nome da instituição e resposta para a secretaria", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "nao-responda@possaas.com.br");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({
      to: "aluno@b.test",
      subject: "Convite",
      html: "<p>Bem-vindo</p>",
      fromName: "Instituto Bressane",
      replyTo: "secretaria@bressane.test",
    });

    expect(result).toEqual({ id: "em_1", delivered: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({
      from: "Instituto Bressane <nao-responda@possaas.com.br>",
      to: "aluno@b.test",
      reply_to: "secretaria@bressane.test",
    });
  });

  it("erro do Resend vira erro claro", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("domain not verified", { status: 403 })));

    await expect(sendEmail({ to: "a@b.test", subject: "x", html: "x" })).rejects.toThrow(/Resend 403/);
  });
});
