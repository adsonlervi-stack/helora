-- Migration 026 (V6): notificações push no celular/computador.
create table if not exists app_settings (
  key text primary key,
  value jsonb not null
);
alter table app_settings enable row level security;
create table if not exists push_subscriptions (
  endpoint text primary key,
  keys jsonb not null,
  user_id uuid,
  account_id uuid references accounts(id) on delete cascade,
  user_agent text,
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
notify pgrst, 'reload schema';
