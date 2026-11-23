# Imagem do app para a VPS (a Vercel não usa este arquivo).
#   target "tools":  roda migrations e cria o master (npm run db:migrate / seed:master)
#   target "runner": o app em produção (padrão do docker-compose.vps.yml)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM builder AS tools
ENV NODE_ENV=production
CMD ["npm", "run", "db:migrate"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
