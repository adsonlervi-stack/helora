-- Migration 023 (V6): eventos no histórico da conversa (encerrada, transferida, assumida).
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.messages'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%author%'
  loop
    execute format('alter table public.messages drop constraint %I', c);
  end loop;
end $$;
alter table messages add constraint messages_author_check check (author in ('user', 'bot', 'operator', 'system'));
create index if not exists messages_media_ts_idx on messages (timestamp) where media_url is not null;
create index if not exists conversations_last_msg_idx on conversations (last_message_at);
notify pgrst, 'reload schema';
