-- ============================================================
-- Migração — adiciona o funil de vendas (Kanban de Negócios)
-- Rode isso no SQL Editor do Supabase (depois da migration_003).
-- ============================================================

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  title text not null,
  value numeric(12, 2),
  stage text not null default 'novo_lead' check (
    stage in ('novo_lead', 'contato', 'negociacao', 'proposta', 'fechado', 'perdido')
  ),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists deals_account_id_idx on deals (account_id);
create index if not exists deals_conversation_id_idx on deals (conversation_id);

alter publication supabase_realtime add table deals;

alter table deals enable row level security;

create policy "Negócios da própria conta" on deals
  for select using (account_id = current_account_id() or is_super_admin());
