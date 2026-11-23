import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { pool } from "./db";
import { sendEmail } from "./email";

const rootDomain = process.env.ROOT_DOMAIN ?? "localhost:3000";
const isLocal = rootDomain.startsWith("localhost");

/**
 * Login por e-mail e senha. As tabelas do Better Auth (user, session,
 * account, verification) são globais: uma pessoa pode ter papéis em várias
 * instituições, definidos em `memberships`.
 */
export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    async sendResetPassword({ user, url }) {
      // Sem await: o envio não atrasa a resposta, que não pode revelar se a conta existe.
      const first = user.name.split(" ")[0];
      void sendEmail({
        to: user.email,
        subject: "Crie uma nova senha",
        html: `<p>Olá, ${first}.</p><p>Use o link abaixo para criar uma nova senha. Ele vale por 1 hora.</p><p><a href="${url}">Criar nova senha</a></p><p>Se você não pediu, ignore este e-mail.</p>`,
        text: `Olá, ${first}. Crie uma nova senha (vale por 1 hora): ${url}\nSe você não pediu, ignore este e-mail.`,
      }).catch((e) => console.error("[auth] falha ao enviar e-mail de redefinição", e));
    },
  },
  trustedOrigins: [`http://*.${rootDomain}`, `https://*.${rootDomain}`, `http://${rootDomain}`, `https://${rootDomain}`],
  advanced: {
    // Em produção a sessão vale para todos os subdomínios das instituições.
    crossSubDomainCookies: isLocal
      ? { enabled: false }
      : { enabled: true, domain: `.${rootDomain.split(":")[0]}` },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
