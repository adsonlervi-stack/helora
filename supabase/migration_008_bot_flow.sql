-- ============================================================
-- Migração — construtor de fluxo do chatbot (árvore de decisão em JSON)
-- Rode isso no SQL Editor do Supabase (depois da migration_007).
-- ============================================================

-- Um fluxo por conta (o "roteiro" que o bot segue). Guardado como JSON,
-- editável pelo cliente no painel — sem precisar mexer em código.
create table if not exists bot_flows (
  account_id uuid primary key references accounts(id) on delete cascade,
  flow jsonb not null,
  updated_at timestamptz not null default now()
);

-- Em qual nó da árvore a conversa está agora (null = fora do fluxo, ou a
-- conta ainda não configurou um fluxo próprio — nesse caso o bot usa o
-- menu padrão fixo, pra não quebrar quem já estava em produção).
alter table conversations add column if not exists bot_node_id text;
