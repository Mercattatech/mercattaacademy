/**
 * Registra no Daily o webhook da plataforma (uma vez por ambiente).
 *   npm run video:webhook -- https://app.seudominio.com.br
 * Precisa de DAILY_API_KEY e DAILY_WEBHOOK_SECRET (base64) no .env. O endereço precisa ser público.
 */
const base = process.argv[2];
const key = process.env.DAILY_API_KEY;
const secret = process.env.DAILY_WEBHOOK_SECRET;
if (!base || !key || !secret) {
  console.error("Uso: npm run video:webhook -- https://seu-dominio  (com DAILY_API_KEY e DAILY_WEBHOOK_SECRET no .env)");
  process.exit(1);
}
const res = await fetch("https://api.daily.co/v1/webhooks", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${base.replace(/\/$/, "")}/api/webhooks/daily`,
    eventTypes: ["participant.left", "meeting.ended", "recording.ready-to-download"],
    hmac: secret,
  }),
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);

export {};
