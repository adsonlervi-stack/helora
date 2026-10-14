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
