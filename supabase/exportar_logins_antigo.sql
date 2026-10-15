-- Rodar no projeto Supabase ANTIGO (São Paulo). Só permite LER os logins para a cópia.
create or replace function public.helora_export_auth()
returns jsonb
language sql
security definer
set search_path = auth, public
as $$
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(to_jsonb(u)) from auth.users u), '[]'::jsonb),
    'identities', coalesce((select jsonb_agg(to_jsonb(i)) from auth.identities i), '[]'::jsonb)
  );
$$;
revoke all on function public.helora_export_auth() from public, anon, authenticated;
grant execute on function public.helora_export_auth() to service_role;
