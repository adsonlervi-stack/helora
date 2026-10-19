-- Helora 030: CRM estilo Trello (anexos e checklist no card)
alter table crm_leads add column if not exists attachments jsonb not null default '[]';
alter table crm_leads add column if not exists checklist jsonb not null default '[]';
notify pgrst, 'reload schema';
