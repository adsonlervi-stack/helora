-- ============================================================
-- Migration 014 — Construtor de fluxos (canvas)
-- Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================

create table if not exists flows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default false,
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flows_account_idx on flows (account_id);

-- Um registro por execução de bloco (para os números "enviadas / respostas")
create table if not exists flow_events (
  id bigint generated always as identity primary key,
  flow_id uuid not null references flows(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  node_id text not null,
  kind text not null check (kind in ('sent', 'reply', 'invalid')),
  port text,
  created_at timestamptz not null default now()
);
create index if not exists flow_events_flow_idx on flow_events (flow_id, created_at);

-- Onde cada conversa está dentro do fluxo + respostas guardadas ({nome}, {email}...)
alter table conversations add column if not exists flow_id uuid references flows(id) on delete set null;
alter table conversations add column if not exists flow_vars jsonb not null default '{}'::jsonb;

alter table flows enable row level security;
alter table flow_events enable row level security;
drop policy if exists "Fluxos da própria conta" on flows;
create policy "Fluxos da própria conta" on flows
  for select using (account_id = current_account_id() or is_super_admin());
drop policy if exists "Eventos de fluxo da própria conta" on flow_events;
create policy "Eventos de fluxo da própria conta" on flow_events
  for select using (account_id = current_account_id() or is_super_admin());
