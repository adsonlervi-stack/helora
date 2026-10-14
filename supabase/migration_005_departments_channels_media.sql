-- ============================================================
-- Migração — Etapas 1, 2 e 3
-- Rode isso no SQL Editor do Supabase (depois da migration_004).
--
-- Etapa 1: Setores (departamentos) + atribuição de conversas
-- Etapa 2: Múltiplos dispositivos de WhatsApp por conta + permissão por atendente
-- Etapa 3: Anexos, áudio (nota de voz), reações e nome do atendente na mensagem
-- ============================================================

-- ============================================================
-- ETAPA 1 — Setores (Departamentos)
-- ============================================================

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

alter table conversations add column if not exists department_id uuid references departments(id) on delete set null;
alter table conversations add column if not exists assigned_agent_id uuid references profiles(id) on delete set null;

create index if not exists conversations_department_id_idx on conversations (department_id);

-- ============================================================
-- ETAPA 2 — Múltiplos dispositivos de WhatsApp + permissões
-- ============================================================

-- A tabela channels já existia (Messenger/Instagram). Agora também guarda
-- dispositivos de WhatsApp — que não têm external_page_id/access_token
-- (a sessão é via QR Code, guardada em disco), por isso essas colunas
-- deixam de ser obrigatórias.
alter table channels alter column external_page_id drop not null;
alter table channels alter column access_token drop not null;
alter table channels add column if not exists name text;
alter table channels add column if not exists department_id uuid references departments(id) on delete set null;

alter table channels drop constraint if exists channels_platform_check;
alter table channels add constraint channels_platform_check
  check (platform in ('whatsapp', 'messenger', 'instagram'));

-- A unicidade de (platform, external_page_id) agora só vale quando
-- external_page_id não é nulo (dispositivos de WhatsApp podem ter null).
alter table channels drop constraint if exists channels_platform_external_page_id_key;
drop index if exists channels_platform_page_id_idx;
create unique index channels_platform_page_id_idx on channels (platform, external_page_id)
  where external_page_id is not null;

-- Matriz de permissão: quais atendentes enxergam qual dispositivo.
-- Se um canal não tiver NENHUMA linha aqui, ele fica visível pra conta
-- inteira (comportamento padrão de compatibilidade, sem restringir nada
-- até você configurar explicitamente).
create table if not exists channel_permissions (
  channel_id uuid not null references channels(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (channel_id, profile_id)
);

-- Status/QR Code por dispositivo (substitui o antigo system_status, que
-- era só por conta — agora cada dispositivo tem o status dele).
create table if not exists channel_status (
  channel_id uuid primary key references channels(id) on delete cascade,
  status text,
  qr text,
  updated_at timestamptz not null default now()
);

alter table conversations add column if not exists channel_id uuid references channels(id) on delete set null;

-- Backfill: cria 1 dispositivo "Principal" pra cada conta que já tinha
-- WhatsApp funcionando. Reaproveita o UUID da própria conta como id do
-- canal — assim a pasta de sessão do Baileys que já existe em disco
-- (sessions/{account_id}) continua batendo, sem precisar escanear o QR
-- de novo.
insert into channels (id, account_id, platform, name)
select a.id, a.id, 'whatsapp', 'Principal'
from accounts a
where not exists (
  select 1 from channels c where c.account_id = a.id and c.platform = 'whatsapp'
);

-- Liga as conversas de WhatsApp já existentes ao dispositivo "Principal"
-- recém-criado da própria conta.
update conversations c
set channel_id = c.account_id
where c.platform = 'whatsapp' and c.channel_id is null;

-- ============================================================
-- ETAPA 3 — Anexos, áudio, reações e nome do atendente
-- ============================================================

alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_type text
  check (media_type is null or media_type in ('image', 'video', 'document', 'audio'));
alter table messages add column if not exists whatsapp_message_id text;
alter table messages add column if not exists reactions jsonb not null default '[]'::jsonb;
alter table messages add column if not exists sender_name text;

-- ============================================================
-- Realtime
-- ============================================================
alter publication supabase_realtime add table departments;
alter publication supabase_realtime add table channel_status;

-- ============================================================
-- RLS
-- ============================================================
alter table departments enable row level security;
alter table profile_departments enable row level security;
alter table channel_permissions enable row level security;
alter table channel_status enable row level security;

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

-- channel_permissions e channel_status não têm policy de select pro papel
-- authenticated de propósito — mesma lógica de channels: só o backend
-- (service_role) acessa.
