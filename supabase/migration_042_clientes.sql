-- V14 · Cadastro de clientes (Empresas e Pessoas), igual ao Agendor
create table if not exists public.crm_clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null default 'empresa',          -- 'empresa' | 'pessoa'
  name text not null,
  doc text,                                       -- CPF ou CNPJ, só números
  legal_name text,
  email text,
  phone text,
  owner_id uuid references public.profiles(id) on delete set null,
  source text,
  sector text,
  category text,
  description text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_clients_account_idx on public.crm_clients (account_id, name);
create index if not exists crm_clients_doc_idx on public.crm_clients (account_id, doc);
alter table public.crm_clients enable row level security;
