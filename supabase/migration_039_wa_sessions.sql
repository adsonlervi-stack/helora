-- Sessão do WhatsApp guardada no banco (o disco do servidor some a cada deploy)
create table if not exists public.wa_sessions (
  channel_id text not null,
  file text not null,
  data text not null,
  updated_at timestamptz not null default now(),
  primary key (channel_id, file)
);
alter table public.wa_sessions enable row level security;
