import type { NextConfig } from "next";

const prod = process.env.NODE_ENV === "production";

// Câmera, microfone e tela: só a própria plataforma e a sala de vídeo (Daily) em quadro.
const permissions = [
  'camera=(self "https://*.daily.co")',
  'microphone=(self "https://*.daily.co")',
  'display-capture=(self "https://*.daily.co")',
  'fullscreen=(self "https://*.daily.co")',
  "geolocation=()",
  "payment=()",
].join(", ");

export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: permissions },
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // Na VPS o Dockerfile liga BUILD_STANDALONE=1 e gera uma pasta enxuta para rodar com `node server.js`. Na Vercel, fica desligado.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Envio de documentos: até 4 MB (a Vercel limita o corpo da requisição a 4,5 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
