-- ============================================================
-- Migração para MULTI-TENANT — rode isso no SQL Editor do Supabase
-- se seu projeto já tinha o schema single-tenant (com ou sem a
-- migration_002_chatwoot_features.sql já aplicada).
--
-- O que faz:
-- 1. Cria accounts, profiles, channels
-- 2. Cria uma conta "padrão" com UUID fixo, pra você poder se
--    vincular a ela manualmente depois (veja o passo final)
-- 3. Adiciona account_id em todas as tabelas existentes e preenche
--    os dados que já existem com a conta padrão
-- 4. Reaperta o RLS: antes qualquer um lia tudo (chave anon pública);
--    agora só quem está logado E pertence à conta vê os dados dela
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Contas ----------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'trial')),
  created_at timestamptz not null default now()
);

-- Conta padrão com UUID fixo — recebe todos os dados que já existiam
-- antes da migração. Troque o nome depois pelo nome real do cliente,
-- ou crie contas novas para os próximos clientes.
insert into accounts (id, name, status)
values ('00000000-0000-0000-0000-000000000001', 'Conta padrão (migração)', 'active')
on conflict (id) do nothing;

-- ---------- Perfis ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner', 'agent')),
  name text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists profiles_account_id_idx on profiles (account_id);

-- ---------- Canais (Messenger/Instagram) ----------
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  platform text not null check (platform in ('messenger', 'instagram')),
  external_page_id text not null,
  access_token text not null,
  created_at timestamptz not null default now(),
  unique (platform, external_page_id)
);

-- Se você já tinha META_PAGE_ACCESS_TOKEN configurado no .env do backend,
-- cadastre o canal existente aqui (ajuste platform e external_page_id):
--
-- insert into channels (account_id, platform, external_page_id, access_token)
-- values ('00000000-0000-0000-0000-000000000001', 'messenger', 'SEU_PAGE_ID', 'SEU_TOKEN_ATUAL');

-- ============================================================
-- Adiciona account_id nas tabelas existentes + backfill
-- ============================================================

alter table conversations add column if not exists account_id uuid references accounts(id);
update conversations set account_id = '00000000-0000-0000-0000-000000000001' where account_id is null;
alter table conversations alter column account_id set not null;
alter table conversations drop constraint if exists conversations_platform_external_id_key;
alter table conversations add constraint conversations_account_platform_external_id_key
  unique (account_id, platform, external_id);
create index if not exists conversations_account_id_idx on conversations (account_id);

alter table messages add column if not exists account_id uuid references accounts(id);
update messages m set account_id = c.account_id from conversations c
  where m.conversation_id = c.id and m.account_id is null;
alter table messages alter column account_id set not null;
create index if not exists messages_account_id_idx on messages (account_id);

alter table auto_replies add column if not exists account_id uuid references accounts(id);
update auto_replies set account_id = '00000000-0000-0000-0000-000000000001' where account_id is null;
alter table auto_replies alter column account_id set not null;
create index if not exists auto_replies_account_id_idx on auto_replies (account_id);

-- system_status tinha "key" como chave primária sozinha; passa a ser composta
alter table system_status add column if not exists account_id uuid references accounts(id);
update system_status set account_id = '00000000-0000-0000-0000-000000000001' where account_id is null;
alter table system_status alter column account_id set not null;
alter table system_status drop constraint if exists system_status_pkey;
alter table system_status add primary key (account_id, key);

alter table labels add column if not exists account_id uuid references accounts(id);
update labels set account_id = '00000000-0000-0000-0000-000000000001' where account_id is null;
alter table labels alter column account_id set not null;
alter table labels drop constraint if exists labels_title_key;
alter table labels add constraint labels_account_title_key unique (account_id, title);
create index if not exists labels_account_id_idx on labels (account_id);

alter table conversation_labels add column if not exists account_id uuid references accounts(id);
update conversation_labels cl set account_id = c.account_id from conversations c
  where cl.conversation_id = c.id and cl.account_id is null;
alter table conversation_labels alter column account_id set not null;

alter table canned_responses add column if not exists account_id uuid references accounts(id);
update canned_responses set account_id = '00000000-0000-0000-0000-000000000001' where account_id is null;
alter table canned_responses alter column account_id set not null;
alter table canned_responses drop constraint if exists canned_responses_short_code_key;
alter table canned_responses add constraint canned_responses_account_short_code_key
  unique (account_id, short_code);
create index if not exists canned_responses_account_id_idx on canned_responses (account_id);

alter table notes add column if not exists account_id uuid references accounts(id);
update notes n set account_id = c.account_id from conversations c
  where n.conversation_id = c.id and n.account_id is null;
alter table notes alter column account_id set not null;

alter table csat_responses add column if not exists account_id uuid references accounts(id);
update csat_responses cs set account_id = c.account_id from conversations c
  where cs.conversation_id = c.id and cs.account_id is null;
alter table csat_responses alter column account_id set not null;
create index if not exists csat_responses_account_id_idx on csat_responses (account_id);

-- ============================================================
-- Funções auxiliares de RLS
-- ============================================================

create or replace function current_account_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select account_id from profiles where id = auth.uid()
$$;

create or replace function is_super_admin()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false)
$$;

-- ============================================================
-- RLS: remove as policies antigas (públicas) e cria as novas,
-- restritas por account_id
-- ============================================================

drop policy if exists "Leitura pública de conversas" on conversations;
drop policy if exists "Leitura pública de mensagens" on messages;
drop policy if exists "Leitura pública de respostas automáticas" on auto_replies;
drop policy if exists "Leitura pública de status" on system_status;
drop policy if exists "Leitura pública de etiquetas" on labels;
drop policy if exists "Leitura pública de etiquetas nas conversas" on conversation_labels;
drop policy if exists "Leitura pública de respostas prontas" on canned_responses;
drop policy if exists "Leitura pública de notas" on notes;
drop policy if exists "Leitura pública de csat" on csat_responses;

alter table accounts enable row level security;
alter table profiles enable row level security;
alter table channels enable row level security;

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

create policy "Status da própria conta" on system_status
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

-- ============================================================
-- PASSO FINAL (manual, fora deste script):
--
-- 1. No painel do Supabase → Authentication → Add user, crie o SEU
--    login (email + senha). Copie o UUID gerado para esse usuário.
-- 2. Rode o SQL abaixo (troque SEU-UUID-AQUI e seu nome):
--
-- insert into profiles (id, account_id, role, name, is_super_admin)
-- values ('SEU-UUID-AQUI', '00000000-0000-0000-0000-000000000001',
--         'owner', 'Seu Nome', true);
--
-- Isso te torna super admin da conta padrão, com acesso a tudo.
-- ============================================================
