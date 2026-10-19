-- Helora 031: modelos de funil e campos personalizados no CRM
alter table crm_pipelines add column if not exists fields jsonb not null default '[]';
alter table crm_pipelines add column if not exists template text;
alter table crm_leads add column if not exists custom jsonb not null default '{}';
notify pgrst, 'reload schema';
