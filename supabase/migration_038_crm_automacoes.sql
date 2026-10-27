-- Migration 038: automações de processo do CRM (estilo Pipefy)
alter table crm_pipelines add column if not exists automations jsonb not null default '[]'::jsonb;
alter table crm_leads add column if not exists auto_log jsonb not null default '{}'::jsonb;
