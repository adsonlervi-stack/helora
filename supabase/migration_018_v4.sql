-- Migration 018 (v4): número real da conversa, planos, aceite de termos,
-- canais Instagram/Facebook/WhatsApp oficial e mídia sob demanda. Pode rodar mais de uma vez.

-- Número real do cliente (o WhatsApp às vezes manda só um ID interno "@lid")
alter table conversations add column if not exists phone text;

-- Planos da Helora
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null default 0,
  max_whatsapp int not null default 1,
  max_users int not null default 3,
  monthly_credits int not null default 0,
  features text,
  highlight boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table plans enable row level security;
drop policy if exists "Planos visíveis" on plans;
create policy "Planos visíveis" on plans for select using (true);
alter table accounts add column if not exists plan_id uuid references plans(id) on delete set null;
alter table accounts add column if not exists max_users int not null default 3;

-- Aceite dos Termos de Uso (usuário) e do Contrato (empresa)
alter table profiles add column if not exists terms_accepted_at timestamptz;
alter table accounts add column if not exists contract_accepted_at timestamptz;
alter table accounts add column if not exists contract_accepted_by uuid references profiles(id) on delete set null;

-- Canais: tipo de conexão do WhatsApp (QR Code ou API oficial) e dados extras
alter table channels add column if not exists provider text not null default 'baileys';   -- baileys | cloud
alter table channels add column if not exists phone_number_id text;                       -- WhatsApp Cloud API
alter table channels add column if not exists waba_id text;

insert into plans (name, price, max_whatsapp, max_users, monthly_credits, features, highlight, sort)
select * from (values
  ('Essencial', 197.00, 1, 3, 500, 'Bot de atendimento|Pipeline de vendas|Respostas prontas|Suporte por chat', false, 1),
  ('Profissional', 397.00, 2, 8, 2000, 'Tudo do Essencial|Campanhas|API e integrações|Relatórios completos', true, 2),
  ('Empresa', 797.00, 5, 25, 6000, 'Tudo do Profissional|Instagram e Facebook|API oficial do WhatsApp|Gerente de conta', false, 3)
) as v(name, price, max_whatsapp, max_users, monthly_credits, features, highlight, sort)
where not exists (select 1 from plans);

-- Figurinhas: permite media_type = 'sticker'
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%media_type%'
  loop
    execute format('alter table public.messages drop constraint %I', c);
  end loop;
end $$;
alter table messages add constraint messages_media_type_check
  check (media_type is null or media_type in ('image', 'video', 'document', 'audio', 'sticker'));

-- Conversas: busca rápida pelo número real
create index if not exists conversations_phone_idx on conversations (account_id, phone);

notify pgrst, 'reload schema';
