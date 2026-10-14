-- ============================================================
-- Migração — Etapa 6 (dashboard avançado) + Etapa 7 (Kanban de Negócios)
-- Rode isso no SQL Editor do Supabase (depois da migration_009).
-- ============================================================

-- ---------- Conversas: quando foi criada / quando foi resolvida ----------
-- Precisamos disso pra filtrar por período de verdade e calcular o TMA
-- (tempo médio de atendimento) direto no banco.
alter table conversations add column if not exists created_at timestamptz;
alter table conversations add column if not exists resolved_at timestamptz;

-- Backfill: conversas que já existem não tem created_at ainda — usamos a
-- data da primeira mensagem como aproximação (ou last_message_at se não
-- tiver nenhuma mensagem, o que não deveria acontecer na prática).
update conversations c
set created_at = coalesce(
  (select min(m.timestamp) from messages m where m.conversation_id = c.id),
  c.last_message_at
)
where c.created_at is null;

alter table conversations alter column created_at set default now();
alter table conversations alter column created_at set not null;

create index if not exists conversations_created_at_idx on conversations (created_at);

-- ---------- Negócios: dono, tempo parado na etapa, motivo de perda ----------
alter table deals add column if not exists owner_id uuid references profiles(id) on delete set null;
alter table deals add column if not exists stage_changed_at timestamptz not null default now();
alter table deals add column if not exists lost_reason text;

-- ---------- Histórico de cada negócio (Etapa 7 — painel lateral) ----------
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
alter publication supabase_realtime add table deal_activities;

alter table deal_activities enable row level security;

create policy "Histórico de negócios da própria conta" on deal_activities
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
  -- TMR (tempo médio até a 1ª resposta) — por bot e por atendente
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
  -- TMA (tempo médio de atendimento) — do início ao resolvido, só quem já resolveu
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
