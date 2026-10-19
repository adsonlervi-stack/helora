-- Migration 025 (V6): Google Agenda + Meet no CRM.
create table if not exists google_tokens (
  user_id uuid primary key,
  account_id uuid references accounts(id) on delete cascade,
  email text,
  refresh_token text,
  updated_at timestamptz not null default now()
);
alter table google_tokens enable row level security;
alter table crm_events add column if not exists google_event_id text;
alter table crm_events add column if not exists meet_link text;
notify pgrst, 'reload schema';
