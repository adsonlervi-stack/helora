-- Migration 020 (V6 fase 1): setores ativos/inativos, colunas do pipeline, limites e API oficial por empresa.
alter table departments add column if not exists active boolean not null default true;
alter table accounts add column if not exists pipeline_stages jsonb;
alter table accounts add column if not exists allow_cloud_api boolean not null default false;
alter table accounts add column if not exists max_users int not null default 3;
-- colunas personalizadas: o estágio do negócio deixa de ser uma lista fixa
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.deals'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%stage%'
  loop
    execute format('alter table public.deals drop constraint %I', c);
  end loop;
end $$;
notify pgrst, 'reload schema';
-- abas liberadas: Gestora define as da empresa (null = todas); Gestor define as dos atendentes
alter table accounts add column if not exists enabled_tabs jsonb;
alter table accounts add column if not exists agent_tabs jsonb;
notify pgrst, 'reload schema';
