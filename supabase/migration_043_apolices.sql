-- V14 · Apólices (vigência e cobrança) e parcelas
alter table public.crm_products add column if not exists vigencia_tipo text not null default 'anual'; -- anual | recorrente | prazo | pontual
alter table public.crm_products add column if not exists vigencia_meses int not null default 12;

create table if not exists public.crm_policies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete set null,
  product_id uuid references public.crm_products(id) on delete set null,
  product_name text,
  insurer text,
  number text,
  tipo text not null default 'anual',               -- anual | recorrente | prazo | pontual
  start_date date,
  end_date date,
  payment text not null default 'avista',           -- avista | parcelado | mensal
  installments int not null default 1,
  amount numeric(12,2),                             -- valor da parcela (ou total, se à vista)
  premium numeric(12,2),                            -- prêmio total
  due_day int,
  commission_pct numeric(6,2),
  billing jsonb not null default '{}'::jsonb,       -- { enabled, daysBefore, template:{title,text,files}, needsAttachment }
  renewal_days int not null default 60,
  renewal_lead_id uuid,
  status text not null default 'ativa',             -- ativa | cancelada | renovada | encerrada
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_policies_account_idx on public.crm_policies (account_id, end_date);
create index if not exists crm_policies_lead_idx on public.crm_policies (lead_id);
alter table public.crm_policies enable row level security;

create table if not exists public.crm_installments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  policy_id uuid not null references public.crm_policies(id) on delete cascade,
  lead_id uuid,
  n int not null,
  total int,
  due_date date not null,
  amount numeric(12,2),
  paid_at timestamptz,
  event_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists crm_installments_policy_idx on public.crm_installments (policy_id, n);
create index if not exists crm_installments_due_idx on public.crm_installments (account_id, due_date);
alter table public.crm_installments enable row level security;
notify pgrst, 'reload schema';
