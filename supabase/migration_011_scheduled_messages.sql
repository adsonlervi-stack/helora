-- ============================================================
-- Migração — Mensagens agendadas (Etapa 8)
-- Rode isso no SQL Editor do Supabase (depois da migration_010).
-- ============================================================

create table if not exists scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  text text not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'canceled')),
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists scheduled_messages_account_id_idx on scheduled_messages (account_id);
create index if not exists scheduled_messages_due_idx on scheduled_messages (status, send_at);

alter publication supabase_realtime add table scheduled_messages;

alter table scheduled_messages enable row level security;

create policy "Mensagens agendadas da própria conta" on scheduled_messages
  for select using (account_id = current_account_id() or is_super_admin());
