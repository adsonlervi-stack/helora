-- ============================================================
-- Migração — rodapé editável por conta ("mensagem embaixo da tela")
-- Rode isso no SQL Editor do Supabase (depois da migration_005).
-- ============================================================

alter table accounts add column if not exists footer_note text;
