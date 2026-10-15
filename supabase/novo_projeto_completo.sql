-- ============================================================
-- Schema da Helora (multi-tenant) — rodar no SQL Editor do Supabase
-- Instalação NOVA (projeto Supabase vazio). Se você já tinha o
-- schema antigo (single-tenant) rodando, use
-- supabase/migration_003_multitenancy.sql em vez deste arquivo.
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- Contas (cada cliente que assina a Helora é uma "account")
-- ============================================================
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'trial')),
  footer_note text,
  created_at timestamptz not null default now()
);

-- ---------- Perfis (1 por usuário do Supabase Auth) ----------
-- Liga cada login (auth.users) a uma conta e define o papel dele.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'agent')),
  name text,
  avatar_url text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists profiles_account_id_idx on profiles (account_id);

-- ---------- Setores (departamentos) ----------
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (account_id, name)
);

-- Um atendente pode pertencer a mais de um setor.
create table if not exists profile_departments (
  profile_id uuid not null references profiles(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  primary key (profile_id, department_id)
);

-- ---------- Canais conectados por conta (WhatsApp/Messenger/Instagram) ----------
-- Cada dispositivo de WhatsApp é uma linha aqui (name = apelido do
-- dispositivo), assim como cada Página/conta do Messenger/Instagram.
-- WhatsApp não usa external_page_id/access_token (a sessão é via QR Code).
-- Esta tabela NÃO é exposta ao frontend (nem por RLS) — só o backend
-- (service_role) acessa, porque guarda o access_token da Meta.
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  platform text not null check (platform in ('whatsapp', 'messenger', 'instagram')),
  name text,
  external_page_id text, -- Page ID (Messenger) ou IG Business ID (Instagram)
  access_token text,
  department_id uuid references departments(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists channels_platform_page_id_idx on channels (platform, external_page_id)
  where external_page_id is not null;

-- Matriz de permissão: quais atendentes enxergam qual dispositivo/canal.
-- Sem nenhuma linha aqui pra um canal = visível pra conta inteira (padrão).
create table if not exists channel_permissions (
  channel_id uuid not null references channels(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (channel_id, profile_id)
);

-- Status/QR Code por dispositivo de WhatsApp.
create table if not exists channel_status (
  channel_id uuid primary key references channels(id) on delete cascade,
  status text,
  qr text,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Dados de cada conta (todas as tabelas abaixo têm account_id)
-- ============================================================

-- ---------- Conversas ----------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  platform text not null check (platform in ('whatsapp', 'messenger', 'instagram')),
  external_id text not null,
  name text,
  mode text not null default 'bot' check (mode in ('bot', 'human')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  priority text check (priority is null or priority in ('urgent', 'high', 'medium', 'low')),
  awaiting_csat boolean not null default false,
  department_id uuid references departments(id) on delete set null,
  assigned_agent_id uuid references profiles(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  last_message_at timestamptz not null default now(),
  unread int not null default 0,
  is_new boolean not null default true,
  bot_node_id text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (account_id, platform, external_id)
);

create index if not exists conversations_account_id_idx on conversations (account_id);
create index if not exists conversations_created_at_idx on conversations (created_at);

-- ---------- Comunicados (avisos do super admin pras contas/usuários) ----------
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  link text,
  scope text not null check (scope in ('all', 'account', 'user')),
  account_id uuid references accounts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists announcements_account_id_idx on announcements (account_id);
create index if not exists announcements_user_id_idx on announcements (user_id);

-- ---------- Fluxo do bot (árvore de decisão configurável em JSON) ----------
create table if not exists bot_flows (
  account_id uuid primary key references accounts(id) on delete cascade,
  flow jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Mensagens ----------
-- account_id é redundante (dá pra chegar nela via conversation_id), mas
-- deixamos aqui direto porque torna as políticas de RLS muito mais simples
-- e rápidas (sem precisar de subquery/join a cada leitura).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  author text not null check (author in ('user', 'bot', 'operator')),
  text text not null,
  media_url text,
  media_type text check (media_type is null or media_type in ('image', 'video', 'document', 'audio')),
  whatsapp_message_id text,
  reactions jsonb not null default '[]'::jsonb,
  sender_name text,
  "timestamp" timestamptz not null default now()
);

create index if not exists messages_account_id_idx on messages (account_id);
create index if not exists messages_conversation_id_idx on messages (conversation_id);
create index if not exists messages_timestamp_idx on messages ("timestamp");

-- ---------- Respostas automáticas do bot (por palavra-chave) ----------
create table if not exists auto_replies (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  keyword text not null,
  response text not null
);

create index if not exists auto_replies_account_id_idx on auto_replies (account_id);

-- ---------- Etiquetas (labels) ----------
create table if not exists labels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  color text not null default '#2a7de1',
  created_at timestamptz not null default now(),
  unique (account_id, title)
);

create index if not exists labels_account_id_idx on labels (account_id);

create table if not exists conversation_labels (
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  primary key (conversation_id, label_id)
);

-- ---------- Mensagens agendadas ----------
create table if not exists scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  text text not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'canceled')),
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists scheduled_messages_account_id_idx on scheduled_messages (account_id);
create index if not exists scheduled_messages_due_idx on scheduled_messages (status, send_at);

-- ---------- Respostas prontas do atendente (canned responses) ----------
create table if not exists canned_responses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  short_code text not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (account_id, short_code)
);

create index if not exists canned_responses_account_id_idx on canned_responses (account_id);

-- ---------- Notas internas (nunca enviadas ao cliente) ----------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists notes_conversation_id_idx on notes (conversation_id);

-- ---------- Pesquisa de satisfação (CSAT) ----------
create table if not exists csat_responses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create index if not exists csat_responses_account_id_idx on csat_responses (account_id);

-- ---------- Negócios (funil de vendas / kanban) ----------
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  title text not null,
  value numeric(12, 2),
  stage text not null default 'novo_lead' check (
    stage in ('novo_lead', 'contato', 'negociacao', 'proposta', 'fechado', 'perdido')
  ),
  stage_changed_at timestamptz not null default now(),
  lost_reason text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists deals_account_id_idx on deals (account_id);
create index if not exists deals_conversation_id_idx on deals (conversation_id);

-- ---------- Histórico de cada negócio (painel lateral do Kanban) ----------
create table if not exists deal_activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  type text not null default 'note' check (type in ('note', 'stage_change', 'system')),
  description text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists deal_activities_deal_id_idx on deal_activities (deal_id);

-- ============================================================
-- Realtime: o painel escuta mudanças direto nas tabelas
-- ============================================================
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversation_labels;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table csat_responses;
alter publication supabase_realtime add table deals;
alter publication supabase_realtime add table departments;
alter publication supabase_realtime add table channel_status;
alter publication supabase_realtime add table deal_activities;
alter publication supabase_realtime add table scheduled_messages;

-- ============================================================
-- Funções auxiliares de RLS
-- ============================================================

-- Conta do usuário logado (null se não tiver perfil)
create or replace function current_account_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select account_id from profiles where id = auth.uid()
$$;

-- É super admin (você, dono da Helora)?
create or replace function is_super_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false)
$$;

-- ============================================================
-- Row Level Security
--
-- Agora que existe login (Supabase Auth), o frontend usa o token do
-- usuário autenticado — não a chave anon "pública" de antes. Cada
-- policy abaixo só libera leitura das linhas da PRÓPRIA conta (ou
-- tudo, se for super admin). Escritas continuam só pelo backend
-- (Railway), que usa a service_role key e ignora RLS.
-- ============================================================

alter table accounts enable row level security;
alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table auto_replies enable row level security;
alter table labels enable row level security;
alter table conversation_labels enable row level security;
alter table canned_responses enable row level security;
alter table notes enable row level security;
alter table csat_responses enable row level security;
alter table deals enable row level security;
alter table departments enable row level security;
alter table profile_departments enable row level security;
alter table channel_permissions enable row level security;
alter table channel_status enable row level security;
-- channels, channel_permissions e channel_status NÃO têm policy de select
-- para "authenticated" de propósito: só o backend (service_role) acessa,
-- porque channels guarda tokens da Meta.
alter table channels enable row level security;
alter table deal_activities enable row level security;
alter table scheduled_messages enable row level security;

create policy "Ver a própria conta" on accounts
  for select using (id = current_account_id() or is_super_admin());

create policy "Ver o próprio perfil e colegas de conta" on profiles
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Conversas da própria conta" on conversations
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Mensagens da própria conta" on messages
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Respostas automáticas da própria conta" on auto_replies
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Etiquetas da própria conta" on labels
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Etiquetas nas conversas da própria conta" on conversation_labels
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Respostas prontas da própria conta" on canned_responses
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Notas da própria conta" on notes
  for select using (account_id = current_account_id() or is_super_admin());

create policy "CSAT da própria conta" on csat_responses
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Negócios da própria conta" on deals
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Setores da própria conta" on departments
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Vínculos de setor da própria conta" on profile_departments
  for select using (
    exists (
      select 1 from profiles p
      where p.id = profile_departments.profile_id
        and (p.account_id = current_account_id() or is_super_admin())
    )
  );

create policy "Histórico de negócios da própria conta" on deal_activities
  for select using (account_id = current_account_id() or is_super_admin());

create policy "Mensagens agendadas da própria conta" on scheduled_messages
  for select using (account_id = current_account_id() or is_super_admin());

-- ============================================================
-- RPC: overview_stats — calcula TUDO do dashboard dentro do Postgres
-- (em vez de trazer todas as conversas/mensagens pro Node e somar lá).
-- Aceita filtros de período, setor, atendente e canal — todos opcionais.
-- ============================================================
create or replace function overview_stats(
  p_account_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_department_id uuid default null,
  p_agent_id uuid default null,
  p_channel_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := coalesce(p_date_from::timestamptz, '1970-01-01'::timestamptz);
  v_to timestamptz := coalesce(p_date_to::timestamptz + interval '1 day', now() + interval '1 day');
  v_result jsonb;
begin
  with scoped_conversations as (
    select c.*
    from conversations c
    where c.account_id = p_account_id
      and c.created_at >= v_from
      and c.created_at < v_to
      and (p_department_id is null or c.department_id = p_department_id)
      and (p_agent_id is null or c.assigned_agent_id = p_agent_id)
      and (p_channel_id is null or c.channel_id = p_channel_id)
  ),
  scoped_messages as (
    select m.*
    from messages m
    join scoped_conversations c on c.id = m.conversation_id
  ),
  totals as (
    select
      (select count(*) from scoped_conversations) as conversations,
      (select count(*) from scoped_messages) as messages
  ),
  by_platform as (
    select jsonb_object_agg(platform, cnt) as obj
    from (
      select platform, count(*) as cnt
      from scoped_conversations
      group by platform
    ) t
  ),
  bot_handled as (
    select count(distinct conversation_id) as cnt
    from scoped_messages
    where author = 'bot'
  ),
  escalated as (
    select count(*) as cnt
    from scoped_conversations
    where mode = 'human' or status = 'resolved'
  ),
  resolved as (
    select count(*) as cnt
    from scoped_conversations
    where status = 'resolved'
  ),
  csat as (
    select avg(cr.rating) as average, count(*) as cnt
    from csat_responses cr
    join scoped_conversations c on c.id = cr.conversation_id
  ),
  first_in as (
    select conversation_id, min("timestamp") as ts
    from scoped_messages
    where direction = 'in'
    group by conversation_id
  ),
  first_bot_out as (
    select conversation_id, min("timestamp") as ts
    from scoped_messages
    where direction = 'out' and author = 'bot'
    group by conversation_id
  ),
  first_human_out as (
    select conversation_id, min("timestamp") as ts
    from scoped_messages
    where direction = 'out' and author = 'operator'
    group by conversation_id
  ),
  tmr_bot as (
    select avg(extract(epoch from (fbo.ts - fi.ts)) / 60) as avg_minutes, count(*) as cnt
    from first_in fi
    join first_bot_out fbo on fbo.conversation_id = fi.conversation_id
  ),
  tmr_human as (
    select avg(extract(epoch from (fho.ts - fi.ts)) / 60) as avg_minutes, count(*) as cnt
    from first_in fi
    join first_human_out fho on fho.conversation_id = fi.conversation_id
  ),
  tma as (
    select avg(extract(epoch from (resolved_at - created_at)) / 60) as avg_minutes, count(*) as cnt
    from scoped_conversations
    where status = 'resolved' and resolved_at is not null
  ),
  messages_by_day as (
    select jsonb_agg(jsonb_build_object('date', d::date, 'count', coalesce(cnt, 0)) order by d)
    as arr
    from generate_series((now() - interval '6 days')::date, now()::date, interval '1 day') d
    left join (
      select date_trunc('day', "timestamp")::date as day, count(*) as cnt
      from scoped_messages
      group by 1
    ) m on m.day = d::date
  ),
  by_agent as (
    select jsonb_agg(jsonb_build_object('name', label, 'count', cnt) order by cnt desc)
    as arr
    from (
      select coalesce(p.name, 'Sem atendente') as label, count(*) as cnt
      from scoped_conversations c
      left join profiles p on p.id = c.assigned_agent_id
      group by 1
      order by count(*) desc
      limit 8
    ) t
  ),
  by_department as (
    select jsonb_agg(jsonb_build_object('name', label, 'count', cnt) order by cnt desc)
    as arr
    from (
      select coalesce(d.name, 'Sem setor') as label, count(*) as cnt
      from scoped_conversations c
      left join departments d on d.id = c.department_id
      group by 1
      order by count(*) desc
      limit 8
    ) t
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'conversations', (select conversations from totals),
      'messages', (select messages from totals)
    ),
    'byPlatform', coalesce((select obj from by_platform), '{}'::jsonb),
    'funnel', jsonb_build_array(
      jsonb_build_object('key', 'received', 'label', 'Conversas iniciadas', 'value', (select conversations from totals)),
      jsonb_build_object('key', 'bot', 'label', 'Respondidas pelo bot', 'value', (select cnt from bot_handled)),
      jsonb_build_object('key', 'escalated', 'label', 'Transferidas p/ atendente', 'value', (select cnt from escalated)),
      jsonb_build_object('key', 'resolved', 'label', 'Resolvidas', 'value', (select cnt from resolved))
    ),
    'csat', jsonb_build_object('average', (select average from csat), 'count', (select cnt from csat)),
    'stageTable', jsonb_build_array(
      jsonb_build_object('stage', 'Bot (1ª resposta)', 'avgMinutes', (select avg_minutes from tmr_bot), 'count', (select cnt from tmr_bot)),
      jsonb_build_object('stage', 'Atendente (1ª resposta)', 'avgMinutes', (select avg_minutes from tmr_human), 'count', (select cnt from tmr_human))
    ),
    'tma', jsonb_build_object('avgMinutes', (select avg_minutes from tma), 'count', (select cnt from tma)),
    'messagesByDay', coalesce((select arr from messages_by_day), '[]'::jsonb),
    'rankingByAgent', coalesce((select arr from by_agent), '[]'::jsonb),
    'rankingByDepartment', coalesce((select arr from by_department), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
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
-- ============================================================
-- Migration 013 — Contatos, prévia de conversa e chat de suporte
-- Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================

-- Prévia da última mensagem e foto na lista de conversas
alter table conversations add column if not exists last_message_preview text;
alter table conversations add column if not exists avatar_url text;

-- ---------- Contatos de cada empresa ----------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  phone text not null,                 -- só dígitos, com DDI (ex: 5584999998888)
  name text,                           -- nome salvo na agenda / editado no painel
  push_name text,                      -- nome que a pessoa usa no WhatsApp
  email text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'whatsapp', 'conversa', 'importacao')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, phone)
);
create index if not exists contacts_account_idx on contacts (account_id);

alter table contacts enable row level security;
drop policy if exists "Contatos da própria conta" on contacts;
create policy "Contatos da própria conta" on contacts
  for select using (account_id = current_account_id() or is_super_admin());

-- ---------- Suporte (empresa ↔ Helora) ----------
create table if not exists support_threads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  subject text,
  status text not null default 'open' check (status in ('open', 'closed')),
  unread_admin int not null default 0,
  unread_user int not null default 0,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists support_threads_account_idx on support_threads (account_id);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references support_threads(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  from_admin boolean not null default false,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_thread_idx on support_messages (thread_id);

alter table support_threads enable row level security;
alter table support_messages enable row level security;
drop policy if exists "Suporte da própria conta" on support_threads;
create policy "Suporte da própria conta" on support_threads
  for select using (account_id = current_account_id() or is_super_admin());
drop policy if exists "Mensagens de suporte da própria conta" on support_messages;
create policy "Mensagens de suporte da própria conta" on support_messages
  for select using (account_id = current_account_id() or is_super_admin());

do $$ begin
  alter publication supabase_realtime add table support_messages;
exception when duplicate_object then null; end $$;
-- ============================================================
-- Migration 014 — Construtor de fluxos (canvas)
-- Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================

create table if not exists flows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default false,
  graph jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flows_account_idx on flows (account_id);

-- Um registro por execução de bloco (para os números "enviadas / respostas")
create table if not exists flow_events (
  id bigint generated always as identity primary key,
  flow_id uuid not null references flows(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  node_id text not null,
  kind text not null check (kind in ('sent', 'reply', 'invalid')),
  port text,
  created_at timestamptz not null default now()
);
create index if not exists flow_events_flow_idx on flow_events (flow_id, created_at);

-- Onde cada conversa está dentro do fluxo + respostas guardadas ({nome}, {email}...)
alter table conversations add column if not exists flow_id uuid references flows(id) on delete set null;
alter table conversations add column if not exists flow_vars jsonb not null default '{}'::jsonb;

alter table flows enable row level security;
alter table flow_events enable row level security;
drop policy if exists "Fluxos da própria conta" on flows;
create policy "Fluxos da própria conta" on flows
  for select using (account_id = current_account_id() or is_super_admin());
drop policy if exists "Eventos de fluxo da própria conta" on flow_events;
create policy "Eventos de fluxo da própria conta" on flow_events
  for select using (account_id = current_account_id() or is_super_admin());
-- ============================================================
-- Migration 015 — Grupos, permissões, painel do cliente, créditos,
-- campanhas (disparo em massa) e API aberta.
-- Rodar uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- ============================================================

-- ---------- Conversas: grupos de WhatsApp ----------
alter table conversations add column if not exists is_group boolean not null default false;

-- Quais grupos cada atendente pode ver (sem linha = só gestor vê o grupo)
create table if not exists group_permissions (
  conversation_id uuid not null references conversations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  primary key (conversation_id, profile_id)
);

-- Quais canais cada usuário vê (sem linha = vê todos os canais da empresa)
create table if not exists profile_channels (
  profile_id uuid not null references profiles(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  primary key (profile_id, channel_id)
);
alter table profile_channels enable row level security;
drop policy if exists "Canais do usuário da própria conta" on profile_channels;
create policy "Canais do usuário da própria conta" on profile_channels
  for select using (account_id = current_account_id() or is_super_admin());

-- ---------- Contato: dados do lead (painel do cliente) ----------
alter table contacts add column if not exists lead_origin text;
alter table contacts add column if not exists lead_status text;
alter table contacts add column if not exists default_agent_id uuid references profiles(id) on delete set null;
alter table contacts add column if not exists default_department_id uuid references departments(id) on delete set null;

-- ---------- Pipeline: lead que entra sem conversa (site / API) ----------
alter table deals add column if not exists contact_name text;
alter table deals add column if not exists contact_phone text;
alter table deals add column if not exists contact_email text;
alter table deals add column if not exists source text;
alter table deals add column if not exists notes text;

-- ---------- Créditos (1 crédito = 1 mensagem de campanha/API) ----------
alter table accounts add column if not exists credits_monthly int not null default 0;

create table if not exists credit_ledger (
  id bigint generated always as identity primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  delta int not null,                       -- + crédito liberado / - mensagem enviada
  kind text not null check (kind in ('monthly', 'manual', 'campaign', 'api', 'refund', 'adjust')),
  reference text,                           -- 'AAAA-MM' na liberação mensal, id da campanha etc.
  note text,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_account_idx on credit_ledger (account_id, created_at);
create unique index if not exists credit_ledger_monthly_uniq on credit_ledger (account_id, reference) where kind = 'monthly';

-- ---------- Campanhas ----------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  message text not null,
  media_url text,
  media_type text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'paused', 'done', 'canceled')),
  scheduled_at timestamptz,
  min_delay int not null default 15,        -- segundos entre mensagens (aleatório entre min e max)
  max_delay int not null default 45,
  hourly_limit int not null default 120,
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  pause_reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists campaigns_account_idx on campaigns (account_id);

create table if not exists campaign_recipients (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  phone text not null,
  name text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error text,
  sent_at timestamptz,
  unique (campaign_id, phone)
);
create index if not exists campaign_recipients_pending_idx on campaign_recipients (campaign_id, status);

-- ---------- API aberta ----------
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  prefix text not null,                     -- primeiros caracteres, para identificar na tela
  key_hash text not null unique,            -- sha256 da chave (a chave em si não fica salva)
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_account_idx on api_keys (account_id);

-- ---------- Segurança (leitura só da própria empresa; escrita só pelo backend) ----------
alter table group_permissions enable row level security;
alter table credit_ledger enable row level security;
alter table campaigns enable row level security;
alter table campaign_recipients enable row level security;
alter table api_keys enable row level security;

drop policy if exists "Permissões de grupo da própria conta" on group_permissions;
create policy "Permissões de grupo da própria conta" on group_permissions
  for select using (account_id = current_account_id() or is_super_admin());
drop policy if exists "Créditos da própria conta" on credit_ledger;
create policy "Créditos da própria conta" on credit_ledger
  for select using (account_id = current_account_id() or is_super_admin());
drop policy if exists "Campanhas da própria conta" on campaigns;
create policy "Campanhas da própria conta" on campaigns
  for select using (account_id = current_account_id() or is_super_admin());
drop policy if exists "Destinatários da própria conta" on campaign_recipients;
create policy "Destinatários da própria conta" on campaign_recipients
  for select using (account_id = current_account_id() or is_super_admin());
-- api_keys: sem policy de leitura (só o backend acessa)
-- Migration 016: status de entrega (tiques), resposta citada, apagar,
-- encaminhar, contato/localização, fluxo por canal, variações de campanha
-- e botão de comunicado. Pode rodar mais de uma vez sem problema.

-- Mensagens
alter table messages add column if not exists status text;            -- pending | sent | delivered | read | failed
alter table messages add column if not exists quoted_id uuid references messages(id) on delete set null;
alter table messages add column if not exists quoted_text text;
alter table messages add column if not exists quoted_author text;
alter table messages add column if not exists deleted_at timestamptz;
alter table messages add column if not exists deleted_by text;
alter table messages add column if not exists forwarded boolean not null default false;
alter table messages add column if not exists extra jsonb;             -- contato / localização
create index if not exists messages_wa_id_idx on messages (whatsapp_message_id);

-- Canal: fluxo de atendimento próprio (o setor já existe em channels.department_id)
alter table channels add column if not exists flow_id uuid references flows(id) on delete set null;

-- Campanhas: até 3 versões da mensagem e filtro por etiqueta
alter table campaigns add column if not exists variants jsonb not null default '[]'::jsonb;
alter table campaigns add column if not exists label_ids uuid[] not null default '{}';

-- Comunicados: texto do botão
alter table announcements add column if not exists button_text text;
-- Migration 017: configurações da empresa (pesquisa de satisfação, horário de
-- atendimento, limite de canais), respostas prontas pessoais, suporte com
-- fila/aceite, canal da campanha e figurinhas. Pode rodar mais de uma vez.

alter table accounts add column if not exists csat_enabled boolean not null default true;
alter table accounts add column if not exists business_hours jsonb;          -- {enabled, tz, days:{0..6:[{from,to}]}, message}
alter table accounts add column if not exists max_whatsapp_channels int not null default 1;

-- Respostas prontas: null = da empresa; preenchido = só daquele usuário
alter table canned_responses add column if not exists owner_id uuid references profiles(id) on delete cascade;

-- Suporte: aguardando -> em atendimento (gestora aceitou) -> fechado
alter table support_threads drop constraint if exists support_threads_status_check;
alter table support_threads add constraint support_threads_status_check check (status in ('waiting', 'open', 'closed'));
alter table support_threads add column if not exists accepted_by text;
alter table support_threads add column if not exists accepted_at timestamptz;
alter table support_messages add column if not exists is_bot boolean not null default false;

-- Campanha: canal (número) que vai disparar
alter table campaigns add column if not exists channel_id uuid references channels(id) on delete set null;

-- ============================================================
-- Funções da migração (copiar dados do projeto antigo)
-- ============================================================
create or replace function public.helora_import_rows(tbl text, rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  sch text := split_part(tbl, '.', 1);
  nm text := split_part(tbl, '.', 2);
  cols text;
  has_identity boolean;
  n int;
begin
  select string_agg(quote_ident(column_name), ',' order by ordinal_position),
         bool_or(identity_generation = 'ALWAYS')
    into cols, has_identity
    from information_schema.columns
   where table_schema = sch and table_name = nm and is_generated = 'NEVER';
  execute format(
    'insert into %I.%I (%s) %s select %s from jsonb_populate_recordset(null::%I.%I, $1) on conflict do nothing',
    sch, nm, cols, case when has_identity then 'overriding system value' else '' end, cols, sch, nm
  ) using rows;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.helora_fix_identities()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and identity_generation is not null
  loop
    execute format(
      'select setval(pg_get_serial_sequence(%L, %L), coalesce((select max(%I) from public.%I), 0) + 1, false)',
      'public.' || r.table_name, r.column_name, r.column_name, r.table_name
    );
  end loop;
end;
$$;

revoke all on function public.helora_import_rows(text, jsonb) from public, anon, authenticated;
revoke all on function public.helora_fix_identities() from public, anon, authenticated;
grant execute on function public.helora_import_rows(text, jsonb) to service_role;
grant execute on function public.helora_fix_identities() to service_role;
