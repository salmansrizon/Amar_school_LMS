-- Test seed for integration tests (tests/integration/*). Idempotent.
-- Two Schools, one School Owner each. Password for both: test-password-123!
do $$
declare
  uid_a uuid := '11111111-1111-1111-1111-111111111111';
  uid_b uuid := '22222222-2222-2222-2222-222222222222';
  uid_super uuid := '33333333-3333-3333-3333-333333333333';
  school_a uuid;
  school_b uuid;
begin
  insert into public.schools (name) select 'Test School A'
    where not exists (select 1 from public.schools where name = 'Test School A');
  insert into public.schools (name) select 'Test School B'
    where not exists (select 1 from public.schools where name = 'Test School B');
  select id into school_a from public.schools where name = 'Test School A';
  select id into school_b from public.schools where name = 'Test School B';

  -- GoTrue requires the *_token/*_change columns to be '' (not NULL) or logins 500.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', uid_a, 'authenticated', 'authenticated',
     'owner-a@test.local', crypt('test-password-123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_b, 'authenticated', 'authenticated',
     'owner-b@test.local', crypt('test-password-123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_super, 'authenticated', 'authenticated',
     'super@test.local', crypt('test-password-123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), uid_a, uid_a,
     jsonb_build_object('sub', uid_a::text, 'email', 'owner-a@test.local', 'email_verified', true),
     'email', now(), now(), now()),
    (gen_random_uuid(), uid_b, uid_b,
     jsonb_build_object('sub', uid_b::text, 'email', 'owner-b@test.local', 'email_verified', true),
     'email', now(), now(), now()),
    (gen_random_uuid(), uid_super, uid_super,
     jsonb_build_object('sub', uid_super::text, 'email', 'super@test.local', 'email_verified', true),
     'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  insert into public.profiles (id, role, school_id)
  values (uid_a, 'school_owner', school_a), (uid_b, 'school_owner', school_b),
         (uid_super, 'super_admin', null)
  on conflict (id) do nothing;
end $$;
