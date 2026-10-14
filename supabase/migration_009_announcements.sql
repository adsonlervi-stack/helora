-- ============================================================
-- Migração — Comunicados (avisos do super admin pras contas/usuários)
-- Rode isso no SQL Editor do Supabase (depois da migration_008).
-- ============================================================

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  link text,
  scope text not null check (scope in ('all', 'account', 'user')),
  account_id uuid references accounts(id) on delete cascade, -- só quando scope = 'account'
  user_id uuid references profiles(id) on delete cascade,     -- só quando scope = 'user'
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists announcements_account_id_idx on announcements (account_id);
create index if not exists announcements_user_id_idx on announcements (user_id);
