-- 0066_super_admin_seed.sql
-- Seed a super_admin demo account so the whole super-admin panel (map #158) is
-- testable end to end. Idempotent (fixed UUID + ON CONFLICT), mirroring
-- 0054_demo_school_seed.sql. Additive only (shared staging+main DB).
--   Super Admin login: demo.super@amarschool.test / DemoSuper#2026
-- profiles.school_id is null — a super_admin belongs to no school.

-- Fixed identifiers
--   super admin user     dab00000-0000-4000-a000-000000000050
--   super admin identity dab00000-0000-4000-a000-0000000000b0

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'dab00000-0000-4000-a000-000000000050',
   'authenticated', 'authenticated', 'demo.super@amarschool.test',
   crypt('DemoSuper#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Amar School Admin"}',
   now(), now(), '', '', '', '')
on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  ('dab00000-0000-4000-a000-0000000000b0', 'dab00000-0000-4000-a000-000000000050',
   'dab00000-0000-4000-a000-000000000050',
   jsonb_build_object('sub','dab00000-0000-4000-a000-000000000050','email','demo.super@amarschool.test'),
   'email', now(), now(), now())
on conflict (id) do nothing;

insert into profiles (id, role, school_id, full_name) values
  ('dab00000-0000-4000-a000-000000000050', 'super_admin', null, 'Amar School Admin')
on conflict (id) do update set role = excluded.role, school_id = excluded.school_id, full_name = excluded.full_name;
