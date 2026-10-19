-- Migration 027 (V6): Prompts de IA (estilo ClickMassa) usados pelo bloco "Atendente IA" dos fluxos.
create table if not exists ai_prompts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  prompt text not null default '',
  history_size int not null default 20,
  max_turns int not null default 20,
  transfer_department_id uuid references departments(id) on delete set null,
  transfer_message_enabled boolean not null default true,
  transfer_message text,
  process_images boolean not null default false,
  unsupported_media_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_prompts_account_idx on ai_prompts (account_id);
alter table ai_prompts enable row level security;
notify pgrst, 'reload schema';
