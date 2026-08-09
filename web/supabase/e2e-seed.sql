-- E2E seed: adds one login user per remaining role (staff_user, dealer,
-- gov_official) on top of seed-test.sql (owner-a/b, super). Password:
-- test-password-123!. Idempotent. Used by the Playwright per-role smoke suite.
do $$
declare
  uid_staff uuid := '44444444-4444-4444-4444-444444444444';
  uid_dealer uuid := '55555555-5555-5555-5555-555555555555';
  uid_gov uuid := '66666666-6666-6666-6666-666666666666';
  uid_agent uuid := '77777777-7777-7777-7777-777777777777';
  school_a uuid;
begin
  select id into school_a from public.schools where name = 'Test School A';

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', uid_staff, 'authenticated', 'authenticated',
     'staff-e2e@test.local', crypt('test-password-123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_dealer, 'authenticated', 'authenticated',
     'dealer-e2e@test.local', crypt('test-password-123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_gov, 'authenticated', 'authenticated',
     'gov-e2e@test.local', crypt('test-password-123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', uid_agent, 'authenticated', 'authenticated',
     'agent-e2e@test.local', crypt('test-password-123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), uid_staff, uid_staff,
     jsonb_build_object('sub', uid_staff::text, 'email', 'staff-e2e@test.local', 'email_verified', true),
     'email', now(), now(), now()),
    (gen_random_uuid(), uid_dealer, uid_dealer,
     jsonb_build_object('sub', uid_dealer::text, 'email', 'dealer-e2e@test.local', 'email_verified', true),
     'email', now(), now(), now()),
    (gen_random_uuid(), uid_gov, uid_gov,
     jsonb_build_object('sub', uid_gov::text, 'email', 'gov-e2e@test.local', 'email_verified', true),
     'email', now(), now(), now()),
    (gen_random_uuid(), uid_agent, uid_agent,
     jsonb_build_object('sub', uid_agent::text, 'email', 'agent-e2e@test.local', 'email_verified', true),
     'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  insert into public.profiles (id, role, school_id) values
    (uid_staff, 'staff_user', school_a),
    (uid_dealer, 'distributor', null),
    (uid_gov, 'gov_official', null),
    (uid_agent, 'agent', null)
  on conflict (id) do nothing;

  -- Agent works under the seeded distributor (agent tasks + assignee-only RLS).
  insert into public.agent_assignments (agent_id, distributor_id) values
    (uid_agent, uid_dealer)
  on conflict (agent_id) do nothing;

  -- Distributor KYC profile so the lifecycle surface (/partners/[id]) has a
  -- status to transition. Starts pending; the lifecycle spec restores it.
  insert into public.distributor_profiles (profile_id, trade_license, nid, status)
    values (uid_dealer, 'TL-E2E-0001', 'NID-E2E-0001', 'pending')
  on conflict (profile_id) do nothing;

  -- One open task assigned to the agent (agent tasks spec: mark done / reopen).
  insert into public.partner_tasks (distributor_id, assignee_id, title, status)
  select uid_dealer, uid_agent, 'E2E Agent Task', 'open'
  where not exists (
    select 1 from public.partner_tasks where title = 'E2E Agent Task' and assignee_id = uid_agent
  );
end $$;

-- One active SMS package so the school buy page (/school/sms/buy) has something
-- to purchase (SMS buy spec: owner buys → wallet segments rise).
insert into public.sms_packages (name, segments, price, active)
select '{"en":"E2E Starter","bn":"E2E স্টার্টার"}'::jsonb, 500, 50000, true
where not exists (select 1 from public.sms_packages where name->>'en' = 'E2E Starter');
