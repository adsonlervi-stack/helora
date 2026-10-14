-- ============================================================
-- Migration 012 — Gestão Helora: dados comerciais das empresas + cobranças
-- Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================

-- Dados comerciais de cada empresa (cliente da Helora)
alter table accounts add column if not exists plan_name text;
alter table accounts add column if not exists monthly_price numeric(10,2) not null default 0;
alter table accounts add column if not exists due_day int not null default 10;
alter table accounts add column if not exists document text;        -- CNPJ/CPF
alter table accounts add column if not exists contact_name text;
alter table accounts add column if not exists contact_phone text;
alter table accounts add column if not exists contact_email text;
alter table accounts add column if not exists notes text;
alter table accounts add column if not exists sold_at date default current_date;

do $$ begin
  alter table accounts add constraint accounts_due_day_chk check (due_day between 1 and 28);
exception when duplicate_object then null; end $$;

-- Cobranças (uma por empresa por mês de referência)
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  reference text not null,                       -- 'AAAA-MM'
  amount numeric(10,2) not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'canceled')),
  paid_at timestamptz,
  payment_method text,                            -- pix, boleto, cartão...
  notes text,
  created_at timestamptz not null default now(),
  unique (account_id, reference)
);

create index if not exists invoices_account_idx on invoices (account_id);
create index if not exists invoices_due_idx on invoices (due_date);

alter table invoices enable row level security;
drop policy if exists "Cobranças da própria conta" on invoices;
create policy "Cobranças da própria conta" on invoices
  for select using (account_id = current_account_id() or is_super_admin());
