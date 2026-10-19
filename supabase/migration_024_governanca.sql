-- Migration 024 (V6 fase 4): usuários da Gestora, log de acessos, auditoria das conversas e boleto manual.
alter table profiles add column if not exists admin_level text;           -- 'master' | 'support' (só para super admin)
alter table invoices add column if not exists boleto_url text;

create table if not exists access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  account_id uuid references accounts(id) on delete cascade,
  user_name text,
  ip text,
  user_agent text,
  event text not null default 'login',
  created_at timestamptz not null default now()
);
create index if not exists access_logs_account_idx on access_logs (account_id, created_at desc);
alter table access_logs enable row level security;

-- Auditoria inalterável das mensagens: toda criação, edição e exclusão vira um registro.
create table if not exists message_audit (
  id bigserial primary key,
  message_id uuid,
  conversation_id uuid,
  account_id uuid,
  action text not null,
  author text,
  direction text,
  sender_name text,
  text text,
  media_url text,
  media_type text,
  at timestamptz not null default now()
);
create index if not exists message_audit_conv_idx on message_audit (account_id, conversation_id, at);
alter table message_audit enable row level security;

create or replace function public.audit_messages() returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then
    if old."timestamp" < now() - interval '119 days' then return old; end if; -- limpeza da retenção
    insert into message_audit (message_id, conversation_id, account_id, action, author, direction, sender_name, text, media_url, media_type)
    values (old.id, old.conversation_id, old.account_id, 'delete', old.author, old.direction, old.sender_name, old.text, old.media_url, old.media_type);
    return old;
  elsif tg_op = 'UPDATE' then
    if new.media_url is null and old.media_url is not null and old."timestamp" < now() - interval '89 days' then return new; end if; -- anexo expirado
    if new.text is distinct from old.text or new.media_url is distinct from old.media_url or new.deleted_at is distinct from old.deleted_at then
      insert into message_audit (message_id, conversation_id, account_id, action, author, direction, sender_name, text, media_url, media_type)
      values (new.id, new.conversation_id, new.account_id, case when new.deleted_at is not null and old.deleted_at is null then 'apagada' else 'update' end,
              new.author, new.direction, new.sender_name, old.text, old.media_url, old.media_type);
    end if;
    return new;
  else
    insert into message_audit (message_id, conversation_id, account_id, action, author, direction, sender_name, text, media_url, media_type)
    values (new.id, new.conversation_id, new.account_id, 'create', new.author, new.direction, new.sender_name, new.text, new.media_url, new.media_type);
    return new;
  end if;
end $$;

drop trigger if exists messages_audit_trg on messages;
create trigger messages_audit_trg after insert or update or delete on messages
  for each row execute function public.audit_messages();

-- O registro de auditoria não pode ser alterado; só sai depois do prazo de retenção (120 dias).
create or replace function public.audit_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Registro de auditoria não pode ser alterado';
  end if;
  if old.at > now() - interval '120 days' then
    raise exception 'Registro de auditoria só pode ser removido após 120 dias';
  end if;
  return old;
end $$;
drop trigger if exists message_audit_guard on message_audit;
create trigger message_audit_guard before update or delete on message_audit
  for each row execute function public.audit_guard();

notify pgrst, 'reload schema';
