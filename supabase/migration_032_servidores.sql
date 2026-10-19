-- Helora 032: preparação para vários servidores (cada empresa fica em um servidor; hoje todas em "main")
alter table accounts add column if not exists server_id text not null default 'main';
create index if not exists accounts_server_idx on accounts (server_id);
notify pgrst, 'reload schema';
