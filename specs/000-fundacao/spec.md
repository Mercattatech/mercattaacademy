# 000 · Fundação

## Objetivo

Deixar pronta a base em que todo requisito seguinte se apoia: instituições isoladas no banco, login, identificação da instituição pelo endereço, recursos ativáveis e o visual base.

## Histórias e critérios de aceite

- Como plataforma, quero que uma instituição nunca veja dados de outra. **Aceite**: com o contexto da instituição A, consultas não devolvem nem alteram linhas da instituição B; sem contexto, nada é devolvido.
- Como master, quero ligar recursos por instituição (RF-14). **Aceite**: núcleo sempre ligado; opcional ligado só onde o master ligou; a instituição não liga sozinha.
- Como instituição, quero meus rótulos acadêmicos (RF-14). **Aceite**: o menu usa o plural do rótulo de módulo da instituição.
- Como visitante, quero acessar a instituição pelo subdomínio. **Aceite**: `bressane.dominio` abre a Bressane; subdomínio inexistente dá 404; instituição suspensa mostra aviso e não abre o conteúdo.
- Como usuário, quero entrar com e-mail e senha. **Aceite**: senha errada mostra mensagem clara no campo; sucesso volta para a página de origem.
- Como master, quero ver as instituições. **Aceite**: `/master` só abre para quem está em `platform_admins`; lista nome, situação, plano e opcionais ligados.

## Fora deste requisito

Cadastro, edição e suspensão de instituições (Sprint 1), convites e gestão de usuários (Sprint 1).
