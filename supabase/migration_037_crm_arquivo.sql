-- Migration 037: CRM — arquivar, reagendar e nunca apagar (exclusão vira "lixeira")
alter table crm_leads add column if not exists archived_at timestamptz;
alter table crm_leads add column if not exists deleted_at timestamptz;
alter table crm_leads add column if not exists snooze_until timestamptz;
create index if not exists crm_leads_archived_idx on crm_leads(account_id, archived_at);
create index if not exists crm_leads_snooze_idx on crm_leads(snooze_until) where snooze_until is not null;
