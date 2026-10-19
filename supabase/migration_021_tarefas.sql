-- Migration 021 (V6 fase 2): tarefas e mensagens agendadas recorrentes (com assinatura e anexo variável).
alter table scheduled_messages add column if not exists sign boolean not null default false;
alter table scheduled_messages add column if not exists created_by_id uuid;
alter table scheduled_messages add column if not exists recurrence text not null default 'none';
alter table scheduled_messages add column if not exists recur_day int;
alter table scheduled_messages add column if not exists recur_every_days int;
alter table scheduled_messages add column if not exists needs_attachment boolean not null default false;
alter table scheduled_messages add column if not exists media_url text;
alter table scheduled_messages add column if not exists media_type text;
alter table scheduled_messages add column if not exists file_name text;
alter table scheduled_messages alter column text drop not null;
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.scheduled_messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.scheduled_messages drop constraint %I', c);
  end loop;
end $$;
alter table scheduled_messages add constraint scheduled_messages_status_check
  check (status in ('pending', 'sent', 'failed', 'canceled', 'waiting_attachment'));

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid,
  created_by uuid,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'done')),
  kind text not null default 'manual',
  scheduled_message_id uuid references scheduled_messages(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
do $$ begin
  alter table tasks add constraint tasks_assignee_id_fkey foreign key (assignee_id) references profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table tasks add constraint tasks_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists tasks_account_idx on tasks (account_id, status, due_at);
alter table tasks enable row level security;
notify pgrst, 'reload schema';
