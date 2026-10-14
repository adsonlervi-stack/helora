-- ============================================================
-- PRIMEIRO ACESSO: cria a sua conta e te torna super admin.
-- Rode UMA vez, depois do schema.sql.
--
-- Antes: Supabase → Authentication → Users → "Add user" →
--        "Create new user" com seu e-mail e senha (marque Auto Confirm).
-- Depois: troque o e-mail abaixo e rode este arquivo no SQL Editor.
-- ============================================================
do $$
declare
  v_email   text := 'seu-email@exemplo.com';   -- <<< TROQUE AQUI
  v_user_id uuid;
  v_account uuid;
begin
  select id into v_user_id from auth.users where email = v_email;
  if v_user_id is null then
    raise exception 'Usuário % não existe. Crie em Authentication → Users primeiro.', v_email;
  end if;

  if exists (select 1 from profiles where id = v_user_id) then
    update profiles set is_super_admin = true, role = 'owner' where id = v_user_id;
    raise notice 'Perfil já existia: agora é super admin.';
    return;
  end if;

  insert into accounts (name) values ('Helora (minha conta)') returning id into v_account;

  insert into profiles (id, account_id, role, name, is_super_admin)
  values (v_user_id, v_account, 'owner', 'Super admin', true);

  -- Primeiro dispositivo de WhatsApp da sua conta.
  insert into channels (account_id, platform, name) values (v_account, 'whatsapp', 'Principal');

  raise notice 'Pronto! Conta % criada e você é super admin.', v_account;
end $$;
