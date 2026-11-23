#!/usr/bin/env bash
# ==============================================================================
# Instalador Automatizado - Mercatta Academy / POS-SAAS para Hostinger VPS
# Suporta: Ubuntu 22.04 / 24.04 e Debian 12
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear
cat << "EOF"
  __  __                  _   _            _                  _                      
 |  \/  |                | | | |          / \                | |                     
 | \  / | ___ _ __ ___ __| |_| |_ __ _   / _ \  ___ __ _   __| | ___ _ __ ___  _   _ 
 | |\/| |/ _ \ '__/ __/ _` __| __/ _` | / ___ \/ __/ _` | / _` |/ _ \ '_ ` _ \| | | |
 | |  | |  __/ | | (_| (_| |_| || (_| |/ /   \ \ (_| (_| || (_| |  __/ | | | | |_| |
 |_|  |_|\___|_|  \___\__,_|\__|\__\__,_/_/   \_\___\__,_| \__,_|\___|_| |_| |_|\__, |
                                                                                  __/ |
                                                                                 |___/ 
      >>> INSTALADOR AUTOMATIZADO - HOSTINGER VPS & COOLIFY <<<
EOF

echo -e "\n${BLUE}${BOLD}Verificando permissões...${NC}"
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Erro: Execute este instalador como root (sudo ./install-hostinger.sh)${NC}"
  exit 1
fi

APP_DIR="/opt/mercatta-academy"
echo -e "${GREEN}✓ Permissões verificadas.${NC}\n"

# ------------------------------------------------------------------------------
# 1. Coleta de Informações Interativa
# ------------------------------------------------------------------------------
echo -e "${YELLOW}${BOLD}--- [1/4] Configuração do Domínio e Credenciais ---${NC}"

read -r -p "Informe seu domínio raiz (ex: suaescola.com.br): " USER_DOMAIN
USER_DOMAIN=$(echo "$USER_DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -e 's/^https:\/\///' -e 's/^http:\/\///' -e 's/\/$//')

while [ -z "$USER_DOMAIN" ]; do
  echo -e "${RED}O domínio não pode ficar em branco.${NC}"
  read -r -p "Informe seu domínio raiz (ex: suaescola.com.br): " USER_DOMAIN
  USER_DOMAIN=$(echo "$USER_DOMAIN" | tr '[:upper:]' '[:lower:]' | sed -e 's/^https:\/\///' -e 's/^http:\/\///' -e 's/\/$//')
done

read -r -p "Informe seu e-mail para emissão de certificado SSL (Let's Encrypt): " USER_EMAIL
while [[ -z "$USER_EMAIL" || ! "$USER_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; do
  echo -e "${RED}Por favor, informe um e-mail válido.${NC}"
  read -r -p "Informe seu e-mail para SSL: " USER_EMAIL
done

read -r -p "E-mail para a conta Master da plataforma [padrão: $USER_EMAIL]: " MASTER_EMAIL
MASTER_EMAIL=${MASTER_EMAIL:-$USER_EMAIL}

read -r -s -p "Senha para a conta Master (mínimo 12 caracteres, deixe vazio para gerar automático): " MASTER_PASSWORD
echo ""

if [ -z "$MASTER_PASSWORD" ]; then
  MASTER_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
  echo -e "${GREEN}Senha gerada para o Master:${NC} ${BOLD}$MASTER_PASSWORD${NC}"
elif [ ${#MASTER_PASSWORD} -lt 12 ]; then
  echo -e "${YELLOW}Senha curta. Gerando uma senha segura com 16 dígitos...${NC}"
  MASTER_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
  echo -e "${GREEN}Senha gerada para o Master:${NC} ${BOLD}$MASTER_PASSWORD${NC}"
fi

# ------------------------------------------------------------------------------
# 2. Escolha do Modo de Instalação
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}${BOLD}--- [2/4] Escolha o Modo de Instalação ---${NC}"
echo -e "1) ${BOLD}Nativo Docker + Caddy (Recomendado na Hostinger)${NC}"
echo -e "   -> Instalação 100% autônoma, consome menos RAM da VPS."
echo -e "   -> SSL On-Demand automático para todos os subdomínios (*.dominio.com.br)."
echo -e "   -> Sobe tudo em menos de 3 minutos.\n"
echo -e "2) ${BOLD}Com Painel Coolify${NC}"
echo -e "   -> Instala o Coolify na VPS e prepara o Docker Compose Stack pronto para o painel."
read -r -p "Escolha a opção [1 ou 2, padrão: 1]: " INSTALL_MODE
INSTALL_MODE=${INSTALL_MODE:-1}

# ------------------------------------------------------------------------------
# 3. Geração de Segredos Criptográficos
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}${BOLD}--- [3/4] Gerando chaves de segurança de 32 bytes...${NC}"
POSTGRES_PASS=$(openssl rand -hex 24)
POS_OWNER_PASS=$(openssl rand -hex 24)
POS_APP_PASS=$(openssl rand -hex 24)
MINIO_USER="minio_admin"
MINIO_PASS=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -hex 32)
PAYMENT_SECRET=$(openssl rand -hex 32)

echo -e "${GREEN}✓ Chaves criptográficas geradas com sucesso.${NC}"

# Atualização do sistema e instalação de utilitários
echo -e "\n${BLUE}${BOLD}Atualizando repositórios do sistema...${NC}"
apt-get update -qq
apt-get install -y -qq curl wget git unzip ufw openssl >/dev/null

# ------------------------------------------------------------------------------
# 4. Configuração e Deploy
# ------------------------------------------------------------------------------
echo -e "\n${YELLOW}${BOLD}--- [4/4] Executando Instalação ---${NC}"

# Garantir Docker instalado
if ! command -v docker &> /dev/null; then
  echo -e "${BLUE}Instalando Docker Engine e Docker Compose...${NC}"
  curl -fsSL https://get.docker.com | sh
fi

# Firewall UFW
echo -e "${BLUE}Configurando regras de firewall (UFW)...${NC}"
ufw allow 22/tcp >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true

# Preparar pasta de trabalho
mkdir -p "$APP_DIR"
cd "$(dirname "$0")/.." # Raiz do repositório
cp -r . "$APP_DIR"
cd "$APP_DIR"

# Escrever arquivo .env
ENV_FILE="$APP_DIR/.env"
cat > "$ENV_FILE" << EOF
# Configurações de Produção - Gerado pelo instalador
NODE_ENV=production
ROOT_DOMAIN=$USER_DOMAIN
ACME_EMAIL=$USER_EMAIL

# Conexões do Banco de Dados
POSTGRES_SUPERUSER_PASSWORD=$POSTGRES_PASS
POS_OWNER_PASSWORD=$POS_OWNER_PASS
POS_APP_PASSWORD=$POS_APP_PASS

DATABASE_URL=postgres://pos_app:${POS_APP_PASS}@postgres:5432/pos_saas
DATABASE_OWNER_URL=postgres://pos_owner:${POS_OWNER_PASS}@postgres:5432/pos_saas

# Autenticação e Criptografia
BETTER_AUTH_URL=https://$USER_DOMAIN
BETTER_AUTH_SECRET=$AUTH_SECRET
PAYMENT_SECRET=$PAYMENT_SECRET

# Armazenamento S3 (MinIO Local)
MINIO_ROOT_USER=$MINIO_USER
MINIO_ROOT_PASSWORD=$MINIO_PASS
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=https://arquivos.$USER_DOMAIN
S3_REGION=us-east-1
S3_BUCKET=pos-saas
S3_ACCESS_KEY=$MINIO_USER
S3_SECRET_KEY=$MINIO_PASS

# Conta Master Inicial
MASTER_EMAIL=$MASTER_EMAIL
MASTER_PASSWORD=$MASTER_PASSWORD
EOF

chmod 600 "$ENV_FILE"

if [ "$INSTALL_MODE" = "2" ]; then
  # Modo Coolify
  echo -e "\n${BLUE}Verificando instalação do Coolify...${NC}"
  if ! command -v coolify &> /dev/null && [ ! -d "/data/coolify" ]; then
    echo -e "${BLUE}Instalando o Coolify na VPS...${NC}"
    ufw allow 8000/tcp >/dev/null 2>&1 || true
    curl -fsSL https://cdn.coolify.io/coolify/install.sh | bash
  fi

  SERVER_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')

  clear
  echo -e "${GREEN}${BOLD}=================================================================${NC}"
  echo -e "${GREEN}${BOLD}   ✓ PREPARAÇÃO PARA O COOLIFY CONCLUÍDA COM SUCESSO!            ${NC}"
  echo -e "${GREEN}${BOLD}=================================================================${NC}\n"
  echo -e "1. Acesse o painel do Coolify no seu navegador:"
  echo -e "   👉 ${BOLD}http://${SERVER_IP}:8000${NC}\n"
  echo -e "2. Crie sua conta inicial no Coolify (se for o primeiro acesso)."
  echo -e "3. No Coolify, vá em: ${BOLD}Projects -> New Resource -> Docker Compose${NC}."
  echo -e "4. O arquivo de Compose otimizado foi preparado em:"
  echo -e "   📄 ${BOLD}$APP_DIR/docker-compose.coolify.yml${NC}"
  echo -e "5. As variáveis de ambiente prontas para colar no Coolify estão em:"
  echo -e "   📄 ${BOLD}$APP_DIR/.env${NC}\n"
  echo -e "Credenciais do Administrador Master da Plataforma:"
  echo -e "   • Login:    ${BOLD}$MASTER_EMAIL${NC}"
  echo -e "   • Senha:    ${BOLD}$MASTER_PASSWORD${NC}\n"
  echo -e "Guarde esses dados em local seguro!"
  exit 0
fi

# Modo 1: Nativo Docker + Caddy
echo -e "\n${BLUE}Construindo e iniciando containers (Next.js, Postgres, MinIO, Caddy)...${NC}"
docker compose -f docker-compose.coolify.yml up -d --build

# Configurar backup automático diário às 03:00 no crontab
CRON_JOB="0 3 * * * $APP_DIR/deploy/backup.sh >> /var/log/pos-saas-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "backup.sh" ; echo "$CRON_JOB") | crontab -

SERVER_IP=$(curl -s https://api.ipify.org || hostname -I | awk '{print $1}')

clear
echo -e "${GREEN}${BOLD}=================================================================${NC}"
echo -e "${GREEN}${BOLD}   ✓ MERCATTA ACADEMY INSTALADO E RODANDO COM SUCESSO!           ${NC}"
echo -e "${GREEN}${BOLD}=================================================================${NC}\n"

echo -e "${YELLOW}${BOLD}⚠️  AÇÃO NECESSÁRIA NO PAINEL DNS DA HOSTINGER:${NC}"
echo -e "Crie 2 registros do tipo ${BOLD}A${NC} apontando para o IP da VPS (${BOLD}$SERVER_IP${NC}):"
echo -e "  1. Nome: ${BOLD}@${NC} (ou $USER_DOMAIN)  ->  Valor: ${BOLD}$SERVER_IP${NC}"
echo -e "  2. Nome: ${BOLD}*${NC} (curinga para as escolas)  ->  Valor: ${BOLD}$SERVER_IP${NC}\n"

echo -e "Assim que o DNS propagar, acesse:"
echo -e "  🌐 ${BOLD}https://$USER_DOMAIN${NC}\n"

echo -e "Credenciais do Administrador Master:"
echo -e "  • E-mail:   ${BOLD}$MASTER_EMAIL${NC}"
echo -e "  • Senha:    ${BOLD}$MASTER_PASSWORD${NC}\n"

echo -e "As credenciais e chaves foram salvas com segurança em: ${BOLD}$APP_DIR/.env${NC}"
echo -e "${GREEN}Tudo pronto para operar! 🚀${NC}\n"
