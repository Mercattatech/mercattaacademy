# 007 · Estabilização e piloto Bressane

Sprint 7. Sem requisito novo de produto: deixa a plataforma pronta para o piloto com o Instituto Bressane.

## Objetivo

Segurança básica ligada por padrão, ambiente de produção verificável, páginas de erro em português, direitos do titular (LGPD) atendidos dentro da plataforma, auditoria visível para a administração e um roteiro de implantação e de piloto que o Lucas consegue seguir sozinho.

## Histórias e critérios de aceite

1. **Cabeçalhos de segurança.** Todas as páginas saem com `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (câmera, microfone e tela liberados só para a própria plataforma e para a sala de vídeo) e, em produção, `Strict-Transport-Security`.
2. **Ambiente verificável.** `npm run check:env` lista o que falta ou está fraco (segredos de exemplo, `BETTER_AUTH_URL` sem https, e-mail e arquivos sem configuração em produção). Sai com erro quando há problema grave.
3. **Health check.** `GET /api/health` responde 200 com o banco funcionando e a configuração sem problemas graves, e 503 caso contrário, sem expor detalhes.
4. **Páginas de erro.** Página não encontrada e erro inesperado em português, sem termos técnicos, com caminho de volta. Erro inesperado nunca mostra detalhes internos.
5. **Meus dados.** O aluno (ou qualquer membro) baixa um JSON com os dados que a instituição guarda sobre ele (perfil, perfis de acesso, inscrições, documentos enviados sem o conteúdo, pagamentos, notas, presenças, certificados, comentários, conversas de atendimento) e pede a exclusão da conta, que abre uma conversa de atendimento para a secretaria.
6. **Privacidade.** Página pública `/privacidade` em cada instituição, em linguagem simples, e link no rodapé.
7. **Auditoria.** A administração vê os últimos registros da instituição (quem, o quê, quando), com filtro por tipo.
8. **Manutenção.** `npm run maintenance` remove notificações lidas há mais de 180 dias e convites vencidos há mais de 30 dias, e informa quantos removeu.
9. **Acessibilidade.** Páginas principais sem violações sérias ou críticas no axe-core.
10. **Documentação.** `docs/DEPLOY.md` (Vercel, Postgres na VPS, MinIO, Resend, Asaas, Daily, domínios), `docs/OPERACAO.md` (backup, restauração, migrations, segredos, incidentes) e `docs/PILOTO.md` (checklist antes, no dia e na primeira semana).

## Regras

- O JSON de exportação só traz dados da própria pessoa naquela instituição. Nunca de outra pessoa, nunca de outra instituição.
- Exclusão de conta é pedido, não ação automática: certificados emitidos, pagamentos e registros de auditoria têm guarda obrigatória e a secretaria decide o que anonimizar.
- O texto de privacidade é um modelo, a revisão jurídica é da instituição.

## Fora do escopo

Exclusão automática de conta, política de retenção configurável, painel de métricas, teste de carga, autenticação em dois fatores, CSP completa.

## Questões em aberto

- Quem é o encarregado de dados (DPO) do Bressane e qual e-mail vai na página de privacidade.
- Prazo de guarda dos documentos dos alunos depois do curso.
