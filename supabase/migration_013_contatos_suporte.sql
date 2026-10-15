-- ============================================================
-- Migration 013 — Contatos, prévia de conversa e chat de suporte
-- Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================

-- Prévia da última mensagem e foto na lista de conversas
alter table conversations add column if not exists last_message_preview text;
alter table conversations add column if not exists avatar_url text;

-- ---------- Contatos de cada empresa ----------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  phone text not null,                 -- só dígitos, com DDI (ex: 5584999998888)
  name text,                           -- nome salvo na agenda / editado no painel
  push_name text,                      -- nome que a pessoa usa no WhatsApp
  email text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'whatsapp', 'conversa', 'importacao')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, phone)
);
create index if not exists contacts_account_idx on contacts (account_id);

alter table contacts enable row level security;
drop policy if exists "Contatos da própria conta" on contacts;
create policy "Contatos da própria conta" on contacts
  for select using (account_id = current_account_id() or is_super_admin());

-- ---------- Suporte (empresa ↔ Helora) ----------
create table if not exists support_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  subject text,
  status text not null default 'open' check (status in ('open', 'closed')),
  unread_admin int not null default 0,
  unread_user int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists support_threads_account_idx on support_threads (account_id);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references support_threads(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  from_admin boolean not null default false,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_thread_idx on support_messages (thread_id);

alter table support_threads enable row level security;
alter table support_messages enable row level security;
drop policy if exists "Suporte da própria conta" on support_threads;
create policy "Suporte da própria conta" on support_threads
  for select using (account_id = current_account_id() or is_super_admin());
drop policy if exists "Mensagens de suporte da própria conta" on support_messages;
create policy "Mensagens de suporte da própria conta" on support_messages
  for select using (account_id = current_account_id() or is_super_admin());

do $$ begin
  alter publication supabase_realtime add table support_messages;
exception when duplicate_object then null; end $$;
