import { Client } from "pg";

async function main() {
  const superuserPass = process.env.POSTGRES_SUPERUSER_PASSWORD;
  const ownerPass = process.env.POS_OWNER_PASSWORD;
  const appPass = process.env.POS_APP_PASSWORD;
  const host = process.env.POSTGRES_HOST ?? "postgres";
  const port = Number(process.env.POSTGRES_PORT ?? 5432);

  if (!superuserPass || !ownerPass || !appPass) {
    console.log("Variáveis de senha do postgres não definidas, pulando ensure-db.");
    return;
  }

  console.log(`Conectando como superusuário postgres em ${host}:${port}...`);

  // Aguarda o postgres responder
  let connected = false;
  for (let attempt = 1; attempt <= 30; attempt++) {
    const client = new Client({
      host,
      port,
      user: "postgres",
      password: superuserPass,
      database: "postgres",
    });

    try {
      await client.connect();
      console.log("Conectado ao Postgres com sucesso!");
      connected = true;

      // 1. Garante os papéis pos_reader, pos_owner e pos_app
      console.log("Verificando papéis do banco (pos_reader, pos_owner, pos_app)...");
      await client.query(`
        do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'pos_reader') then
            create role pos_reader nologin bypassrls;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'pos_owner') then
            create role pos_owner login nobypassrls;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'pos_app') then
            create role pos_app login nobypassrls;
          end if;
        end $$;
      `);

      await client.query(`grant pos_reader to pos_owner`);

      // 2. Atualiza as senhas com as variáveis atuais
      const esc = (s: string) => "'" + s.replace(/'/g, "''") + "'";
      await client.query(`alter role pos_owner password ${esc(ownerPass)}`);
      await client.query(`alter role pos_app password ${esc(appPass)}`);
      console.log("Senhas dos papéis pos_owner e pos_app atualizadas.");

      // 3. Garante que o banco pos_saas existe
      const checkDb = await client.query(`select 1 from pg_database where datname = 'pos_saas'`);
      if (checkDb.rows.length === 0) {
        console.log("Banco pos_saas não encontrado. Criando database pos_saas...");
        await client.query(`create database pos_saas owner pos_owner`);
        console.log("Banco pos_saas criado com sucesso!");
      } else {
        console.log("Banco pos_saas já existe.");
      }

      await client.end();
      break;
    } catch (err: unknown) {
      await client.end().catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`Tentativa ${attempt}/30: aguardando Postgres (${msg})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!connected) {
    throw new Error("Não foi possível conectar ao Postgres como superusuário após 30 tentativas.");
  }
}

main().catch((err) => {
  console.error("Erro no ensure-db:", err);
  process.exit(1);
});
