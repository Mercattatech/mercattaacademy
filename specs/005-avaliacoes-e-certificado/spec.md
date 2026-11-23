# 005 · Avaliações, notas, frequência e certificado

Requisitos: RF-06, RF-07 e RF-16. Sprint 5.

## Objetivo

O professor cria as avaliações de cada módulo e lança as notas. O aluno acompanha notas, frequência e situação em um boletim. A secretaria e a coordenação veem o relatório da turma. Quando o aluno cumpre a nota e a frequência exigidas pelo curso, o certificado é emitido sozinho, com os dados do curso, e qualquer pessoa pode conferir sua autenticidade.

## Histórias e critérios de aceite

1. **Criar avaliação.** Coordenação, administração e o professor do módulo criam avaliações com título, peso, nota máxima (padrão 10) e data opcional. Podem editar e remover (remover apaga as notas, com confirmação).
2. **Lançar notas.** Em uma tela por avaliação, o professor vê todos os alunos com acesso liberado e digita a nota de cada um. Nota vazia é "sem nota". O aluno é avisado quando recebe uma nota nova.
3. **Média do módulo.** Média ponderada pelos pesos, normalizada para 0 a 10. Só existe quando todas as avaliações do módulo têm nota.
4. **Média final.** Média dos módulos que têm avaliação, ponderada pela carga horária do módulo (sem carga, peso 1).
5. **Frequência.** Presenças dividido por aulas com presença fechada (aulas canceladas não contam).
6. **Regras do curso.** Cada curso define nota mínima (padrão 7,0) e frequência mínima (padrão 80%).
7. **Situação.** Em andamento (falta nota ou fechar presença de alguma aula), Aprovado (completo, nota e frequência cumpridas) ou Reprovado (completo, com o motivo: nota, frequência ou as duas).
8. **Certificado automático.** Ao lançar nota ou fechar presença, a plataforma reavalia os alunos da turma. Quem passou a Aprovado ganha o certificado, com código único, e é avisado. Não emite duas vezes.
9. **Dados do certificado.** Nome do aluno, curso, turma, período, carga horária, média final, frequência, data de emissão, código, nome e cargo de quem assina (configurado pela instituição) e endereço de verificação com QR code. O PDF é gerado na hora a partir dos dados gravados na emissão.
10. **Conferência pública.** Qualquer pessoa abre o endereço do certificado e vê se é válido, com nome, curso e data. Certificado anulado aparece como anulado.
11. **Anular.** A administração anula um certificado com motivo. A anulação fica no registro de auditoria.
12. **Relatório da turma.** Tabela por aluno com média de cada módulo, média final, frequência, situação e certificado, filtrável por turma.

## Regras

- Só entram nas contas alunos com inscrição ativa e acesso liberado.
- Nota entre 0 e a nota máxima da avaliação, até duas casas decimais.
- Mudar uma nota depois de emitido o certificado não anula o certificado. A equipe vê o aviso e decide se anula.
- O professor só lança nota nos módulos em que é professor do módulo ou de alguma aula do módulo. Coordenação e administração, em todos.
- O aluno só vê as próprias notas. Certificado só o próprio aluno e a equipe baixam. A conferência pública mostra apenas nome, curso, turma e data.
- Código do certificado não é adivinhável (12 caracteres aleatórios).

## Fora do escopo

Prova online com correção automática e entrega de trabalho pelo aluno (o MVP lança nota manualmente). Rubrica, PjBL e nota por pares (recurso opcional futuro). Assinatura como imagem. Segunda via por e-mail. Histórico escolar.

## Questões em aberto

- Assinatura: hoje é nome e cargo em texto. A imagem da assinatura depende da decisão da instituição.
- Se a emissão deve esperar o fim da turma (hoje sai quando o aluno fica Aprovado, com tudo completo).
- Recuperação e arredondamento da média (hoje sem arredondar, mostrado com uma casa).
