# Guia de Instalação na Hostinger VPS usando Coolify

Este guia orienta passo a passo a publicação do **Mercatta Academy / POS-SAAS** em uma VPS da **Hostinger** utilizando o painel **Coolify** (ou o instalador automatizado).

---

## 1. Configurar os Registros DNS na Hostinger

Antes de subir a aplicação, vá ao painel de gerenciamento do seu domínio na Hostinger (ou Cloudflare, se gerenciar por lá) e crie **dois registros do tipo A** apontando para o IP da sua VPS:

| Tipo | Nome | Aponta para (Conteúdo) | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `@` | `SEU_IP_DA_VPS` | Automático / 300 |
| **A** | `*` | `SEU_IP_DA_VPS` | Automático / 300 |

> **Por que o curinga (`*`) é obrigatório?**  
> A plataforma é multi-tenant. Cada instituição criada ganha seu próprio subdomínio automaticamente (ex: `bressane.seudominio.com.br`, `escola2.seudominio.com.br`). O curinga direciona todos esses acessos e o subdomínio `arquivos.seudominio.com.br` (onde ficam os vídeos e documentos) para a sua VPS.

---

## 2. Método Rápido: Usando o Instalador Automatizado na VPS

Se você acabou de criar a VPS na Hostinger (com Ubuntu 22.04 ou 24.04):

1. Conecte-se à sua VPS via SSH:
   ```bash
   ssh root@SEU_IP_DA_VPS
   ```

2. Baixe os arquivos do projeto ou copie o instalador:
   ```bash
   # Dentro da pasta do projeto na VPS:
   sudo ./scripts/install-hostinger.sh
   ```

O instalador irá:
- Solicitar seu domínio (ex: `seudominio.com.br`) e e-mail.
- Perguntar se você quer rodar via **Coolify** ou modo **Direto (Docker + Caddy)**.
- Instalar o Coolify e o Docker automaticamente caso ainda não estejam instalados.
- Gerar todas as chaves criptográficas de 32 bytes necessárias (banco, senhas, Better Auth, pagamentos).
- Executar as migrations do banco de dados e criar seu usuário **Master** administrador.

---

## 3. Método Manual: Configurando pelo Painel Web do Coolify

Se você já tem o Coolify rodando na sua VPS (`http://SEU_IP:8000`):

### Passo 1: Criar novo recurso
1. No menu lateral do Coolify, clique em **Projects** e selecione (ou crie) um projeto.
2. Clique em **+ New Resource**.
3. Escolha **Docker Compose**.

### Passo 2: Fonte do código
- Você pode conectar o repositório **Git** (GitHub/GitLab) onde subiu este projeto.
- Ou selecionar **Raw Compose** e colar o conteúdo de [docker-compose.coolify.yml](file:///Users/matheusconti/Projects/Programas%20e%20sites/Mercatta%20Academy/docker-compose.coolify.yml).

### Passo 3: Variáveis de Ambiente (Environment Variables)
No Coolify, na aba **Environment Variables**, adicione as seguintes chaves:

```env
ROOT_DOMAIN=seudominio.com.br
ACME_EMAIL=seu-email@seudominio.com.br

# Senhas do Postgres (gere senhas seguras com openssl rand -hex 24)
POSTGRES_SUPERUSER_PASSWORD=gere_uma_senha_forte
POS_OWNER_PASSWORD=gere_uma_senha_forte
POS_APP_PASSWORD=gere_uma_senha_forte

# Armazenamento MinIO (S3)
MINIO_ROOT_USER=minio_admin
MINIO_ROOT_PASSWORD=gere_uma_senha_forte

# Segredos da Aplicação (mínimo 32 caracteres)
BETTER_AUTH_SECRET=gere_uma_chave_hex_32_bytes
PAYMENT_SECRET=gere_uma_chave_hex_32_bytes

# Conta Master Inicial
MASTER_EMAIL=admin@seudominio.com.br
MASTER_PASSWORD=senha_forte_master_min_12_chars
```

> **Dica para gerar senhas:** No terminal do seu Mac/Linux você pode rodar:  
> `openssl rand -hex 32`

### Passo 4: Fazer o Deploy
Clique em **Deploy** no topo direito do Coolify.
O Coolify irá:
1. Subir o PostgreSQL e o MinIO.
2. Rodar automaticamente o container `migrator` que aplica as tabelas e cria sua conta Master.
3. Subir a aplicação Next.js e o Caddy com emissão automática de certificado HTTPS para o domínio e todos os subdomínios.

---

## 4. Primeiro Acesso

Assim que a instalação finalizar:
1. Acesse: `https://seudominio.com.br/login`
2. Faça login com o seu e-mail Master e a senha que você configurou.
3. Você terá acesso ao painel Master em `/master/instituicoes` para cadastrar suas primeiras instituições clientes!
