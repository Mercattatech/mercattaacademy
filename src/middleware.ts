import { NextResponse, type NextRequest } from "next/server";

/**
 * Identifica a instituição pelo subdomínio e reescreve a rota:
 *   bressane.possaas.com.br/qualquer  ->  /t/bressane/qualquer
 * O domínio raiz (sem subdomínio) serve o site da plataforma e o painel master.
 * Em desenvolvimento: http://bressane.localhost:3000
 */
const RESERVED = new Set(["www", "app", "master", "api", "arquivos"]);
const PASSTHROUGH = ["/api", "/login", "/cadastro", "/escolher","/esqueci-senha", "/redefinir-senha","/_next", "/favicon.ico", "/t/"];

export function middleware(request: NextRequest) {
  const rootDomain = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const { pathname } = request.nextUrl;

  if (PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const slug = subdomainOf(host, rootDomain);
  if (!slug || RESERVED.has(slug)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/t/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

function subdomainOf(host: string, rootDomain: string): string | null {
  if (!host.endsWith(`.${rootDomain}`)) return null;
  const sub = host.slice(0, -(rootDomain.length + 1));
  return sub && !sub.includes(".") ? sub : null;
}

export const config = {
  // api/video-upload fica de fora: o corpo é um vídeo grande e o middleware não pode guardá-lo em memória.
  matcher: ["/((?!_next/static|_next/image|api/video-upload|.*\\..*).*)"],
};
