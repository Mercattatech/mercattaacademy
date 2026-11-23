-- 0003 · Catálogo de recursos e plano padrão (dados de referência, iguais em todos os ambientes)

insert into features (key, name, description, kind, sort_order) values
  -- Núcleo: toda instituição tem
  ('vitrine',        'Vitrine e inscrição',      'Página pública com cursos, turmas e valores; inscrição por turma',        'core', 10),
  ('secretaria',     'Secretaria digital',       'Documentos obrigatórios e conferência antes do pagamento',                'core', 20),
  ('pagamento',      'Pagamento e acesso',       'Cobrança na conta Asaas da instituição e liberação automática de acesso', 'core', 30),
  ('aulas_ao_vivo',  'Aulas ao vivo',            'Transmissão, presença automática, PDFs e gravação anexada',               'core', 40),
  ('avaliacoes',     'Avaliações',               'Provas dissertativas e testes objetivos',                                 'core', 50),
  ('notas_faltas',   'Notas e faltas',           'Boletim do aluno e relatório da turma por módulo',                        'core', 60),
  ('calendario',     'Calendário',               'Agenda geral e por módulo',                                               'core', 70),
  ('professores',    'Professores',              'Página com mini CV e módulos de cada professor',                          'core', 80),
  ('comunicacao',    'Comunicação',              'Avisos, comentários por aula e notificações',                             'core', 90),
  ('certificado',    'Certificado',              'Emissão automática com nota e frequência mínimas',                        'core', 100),
  -- Opcionais: ligados por instituição
  ('pjbl',           'PjBL e equipes',           'Entrega em equipe com rubrica, nota do tutor e dos pares',                'optional', 200),
  ('percurso',       'Percurso avaliativo',      'Aluno escolhe a trilha de avaliação até uma data',                        'optional', 210),
  ('pares',          'Avaliação por pares',      'Distribuição anônima de entregas entre colegas',                          'optional', 220),
  ('recuperacao',    'Recuperação',              'Avaliação extra para quem ficou abaixo da média',                         'optional', 230),
  ('aulas_gravadas', 'Aulas gravadas em blocos', 'Aulas assíncronas com vídeo, texto, PDF, quiz e checklist',               'optional', 240),
  ('forum',          'Fórum da turma',           'Discussão geral por turma',                                               'optional', 250),
  ('nps',            'Pesquisa de satisfação',   'NPS ao concluir módulo ou curso',                                         'optional', 260);

-- Valores fictícios para modelagem (decisão de 11/11/2026).
insert into plans (name, price_per_course_cents, included_students, extra_student_cents)
values ('Padrão (fictício)', 30000, 100, 300);
