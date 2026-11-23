/**
 * Limpeza periódica. Rode por agendamento (cron da VPS ou GitHub Actions) uma vez por dia:
 *   npm run maintenance
 * Remove notificações lidas há mais de 180 dias, convites vencidos há mais de 30 dias
 * e envios de vídeo abandonados há mais de 1 dia (registro e arquivo parcial).
 */
import { Client } from "pg";
import { deleteFile } from "../src/lib/storage";

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  console.error("DATABASE_OWNER_URL não definida.");
  process.exit(1);
}
const c = new Client({ connectionString: url });
await c.connect();
try {
  await c.query("begin");
  await c.query("select set_config('app.is_master', 'on', true)");
  const n = await c.query("delete from notifications where read_at is not null and read_at < now() - interval '180 days'");
  const i = await c.query("delete from invites where expires_at < now() - interval '30 days'");
  const abandoned = await c.query<{ storage_key: string }>("delete from module_videos where status = 'uploading' and created_at < now() - interval '1 day' returning storage_key");
  await c.query("commit");
  for (const { storage_key } of abandoned.rows) await deleteFile(storage_key).catch(() => {});
  console.log(`Notificações removidas: ${n.rowCount}. Convites removidos: ${i.rowCount}. Envios de vídeo abandonados: ${abandoned.rowCount}.`);
} catch (e) {
  await c.query("rollback");
  console.error(e);
  process.exitCode = 1;
} finally {
  await c.end();
}
