-- ============================================================================
-- Contas de teste (login por email/senha) — rode DEPOIS do schema.sql.
-- Cria adm1/adm2/adm3 já confirmadas. Senha: 123456.
-- Login (email):  adm1@teste.com | adm2@teste.com | adm3@teste.com
-- Idempotente: se o email já existir, pula.
-- ============================================================================
create extension if not exists pgcrypto;

do $$
declare
  v_email  text;
  v_id     uuid;
  v_emails text[] := array['adm1@teste.com', 'adm2@teste.com', 'adm3@teste.com'];
begin
  foreach v_email in array v_emails loop
    if exists (select 1 from auth.users where email = v_email) then
      continue;
    end if;

    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      v_email, crypt('123456', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email),
      'email', now(), now(), now()
    );
  end loop;
end $$;

-- Conferir:
select email, email_confirmed_at is not null as confirmado, created_at
from auth.users
where email in ('adm1@teste.com', 'adm2@teste.com', 'adm3@teste.com')
order by email;
