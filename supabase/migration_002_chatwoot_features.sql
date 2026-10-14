-- ============================================================
-- Migração incremental — rode isso no SQL Editor do Supabase
-- se você já tinha rodado o schema.sql antigo (projeto em produção).
-- Traz: prioridade + CSAT na conversa, etiquetas, respostas prontas,
-- notas internas e pesquisa de satisfação.
-- ============================================================

-- ---------- Conversas: novos campos ----------
alter table conversations add column if not exists priority text
  check (priority is null or priority in ('urgent', 'high', 'medium', 'low'));
alter table conversations add column if not exists awaiting_csat boolean not null default false;

-- ---------- Etiquetas (labels) ----------
create table if not exists labels (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  color text not null default '#2a7de1',
  created_at timestamptz not null default now()
);

create table if not exists conversation_labels (
  conversation_id uuid not null references conversations(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  primary key (conversation_id, label_id)
);

-- ---------- Respostas prontas do atendente (canned responses) ----------
create table if not exists canned_responses (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------- Notas internas ----------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists notes_conversation_id_idx on notes (conversation_id);

-- ---------- CSAT ----------
create table if not exists csat_responses (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

-- ---------- Realtime ----------
alter publication supabase_realtime add table conversation_labels;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table csat_responses;

-- ---------- RLS (só leitura pro anon, igual ao resto do sistema) ----------
alter table labels enable row level security;
alter table conversation_labels enable row level security;
alter table canned_responses enable row level security;
alter table notes enable row level security;
alter table csat_responses enable row level security;

create policy "Leitura pública de etiquetas" on labels
  for select using (true);

create policy "Leitura pública de etiquetas nas conversas" on conversation_labels
  for select using (true);

create policy "Leitura pública de respostas prontas" on canned_responses
  for select using (true);

create policy "Leitura pública de notas" on notes
  for select using (true);

create policy "Leitura pública de csat" on csat_responses
  for select using (true);
