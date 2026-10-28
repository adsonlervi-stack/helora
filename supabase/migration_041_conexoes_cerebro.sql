-- V13 · Conexões (integrações por empresa) e Cérebro (base de conhecimento)
create table if not exists public.account_integrations (
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, provider)
);
alter table public.account_integrations enable row level security;

create table if not exists public.brain_docs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  source text not null default 'texto',
  title text not null,
  url text,
  ref text,
  chars integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brain_docs_account_idx on public.brain_docs(account_id, created_at desc);
create unique index if not exists brain_docs_ref_idx on public.brain_docs(account_id, source, ref) where ref is not null;
alter table public.brain_docs enable row level security;

create table if not exists public.brain_chunks (
  id bigserial primary key,
  doc_id uuid not null references public.brain_docs(id) on delete cascade,
  account_id uuid not null,
  idx integer not null default 0,
  content text not null,
  tsv tsvector generated always as (to_tsvector('portuguese', content)) stored
);
create index if not exists brain_chunks_tsv_idx on public.brain_chunks using gin(tsv);
create index if not exists brain_chunks_account_idx on public.brain_chunks(account_id);
alter table public.brain_chunks enable row level security;

-- Atendente IA por canal e conhecimento por atendente
alter table public.channels add column if not exists ai_prompt_id uuid references public.ai_prompts(id) on delete set null;
alter table public.brain_docs add column if not exists agent_ids uuid[];

-- Busca no cérebro: palavras da pergunta (qualquer uma), ordenado por relevância.
-- p_prompt: só o que é da empresa toda (agent_ids vazio) ou do atendente IA informado.
drop function if exists public.brain_search(uuid, text, int);
create or replace function public.brain_search(p_account uuid, p_query text, p_limit int default 6, p_prompt uuid default null)
returns table (doc_id uuid, title text, source text, url text, content text, rank real)
language sql stable as $$
  select c.doc_id, d.title, d.source, d.url, c.content, ts_rank_cd(c.tsv, q) as rank
  from public.brain_chunks c
  join public.brain_docs d on d.id = c.doc_id,
       to_tsquery('portuguese', p_query) q
  where c.account_id = p_account and c.tsv @@ q
    and (p_prompt is null or d.agent_ids is null or cardinality(d.agent_ids) = 0 or p_prompt = any(d.agent_ids))
  order by rank desc
  limit greatest(1, least(p_limit, 20));
$$;

-- Reunião: avisar o cliente (WhatsApp / e-mail) e lembretes
alter table public.crm_events add column if not exists notify jsonb not null default '{}'::jsonb;

-- IA Helora: conversas salvas por usuário
create table if not exists public.ai_studio_chats (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid,
  title text not null default 'Nova conversa',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_studio_chats_user_idx on public.ai_studio_chats(account_id, user_id, updated_at desc);
alter table public.ai_studio_chats enable row level security;
