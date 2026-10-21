-- Card do CRM estilo Pipedrive: histórico (mudanças de etapa, anotações, arquivos) e ganho/perdido
alter table crm_leads add column if not exists history jsonb not null default '[]'::jsonb;
alter table crm_leads add column if not exists outcome text;           -- null | 'won' | 'lost'
alter table crm_leads add column if not exists outcome_at timestamptz;
alter table crm_leads add column if not exists lost_reason text;
alter table crm_leads add column if not exists expected_close date;
notify pgrst, 'reload schema';
-- Mensagens prontas por funil (com variáveis do card)
alter table crm_pipelines add column if not exists messages jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
