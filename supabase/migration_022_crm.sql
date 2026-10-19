-- Migration 022 (V6 fase 3): CRM — funis, leads, tags, produtos/serviços e agenda.
create table if not exists crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  stages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists crm_tags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  color text not null default '#0a84ff',
  created_at timestamptz not null default now()
);
create table if not exists crm_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  recurring boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  pipeline_id uuid references crm_pipelines(id) on delete set null,
  stage text not null default 'novos',
  name text not null,
  phone text,
  email text,
  company text,
  value numeric(12,2),
  owner_id uuid,
  tag_ids uuid[] not null default '{}',
  source text,
  notes text,
  conversation_id uuid references conversations(id) on delete set null,
  stage_changed_at timestamptz not null default now(),
  last_interaction_at timestamptz,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table crm_leads add constraint crm_leads_owner_id_fkey foreign key (owner_id) references profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists crm_leads_account_idx on crm_leads (account_id, pipeline_id, stage);
create index if not exists crm_leads_phone_idx on crm_leads (account_id, phone);
create table if not exists crm_lead_products (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lead_id uuid not null references crm_leads(id) on delete cascade,
  product_id uuid not null references crm_products(id) on delete cascade,
  qty numeric(10,2) not null default 1,
  price numeric(12,2) not null default 0
);
create table if not exists crm_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  lead_id uuid references crm_leads(id) on delete cascade,
  title text not null,
  kind text not null default 'reuniao',
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text,
  owner_id uuid,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
do $$ begin
  alter table crm_events add constraint crm_events_owner_id_fkey foreign key (owner_id) references profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists crm_events_account_idx on crm_events (account_id, starts_at);
alter table crm_pipelines enable row level security;
alter table crm_tags enable row level security;
alter table crm_products enable row level security;
alter table crm_leads enable row level security;
alter table crm_lead_products enable row level security;
alter table crm_events enable row level security;
notify pgrst, 'reload schema';
