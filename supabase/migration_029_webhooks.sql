-- Helora 029: webhooks de integração
create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  url text not null,
  secret text not null default encode(gen_random_bytes(24), 'hex'),
  events text[] not null default '{}',
  active boolean not null default true,
  last_status int,
  last_error text,
  last_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_account_idx on public.webhooks(account_id);
alter table public.webhooks enable row level security;
