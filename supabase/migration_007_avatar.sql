-- ============================================================
-- Migração — foto de perfil do usuário (avatar_url em profiles)
-- Rode isso no SQL Editor do Supabase (depois da migration_006).
-- ============================================================

alter table profiles add column if not exists avatar_url text;
