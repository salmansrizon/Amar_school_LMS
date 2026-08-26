-- Test seed for integration tests (tests/integration/*). Idempotent.
-- Two Schools, one School Owner each, plus one Student of School A.
-- Password for all of them: test-password-123!
do $$
declare
  uid_a uuid := '11111111-1111-1111-1111-111111111111';
  uid_b uuid := '22222222-2222-2222-2222-222222222222';
  uid_super uuid := '33333333-3333-3333-3333-333333333333';
  uid_student uuid := '88888888-8888-8888-8888-888888888888';
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

  -- Student Portal fixture (map #434, #441). One Student of School A with a
  -- login, in class "Seed Class - A". The address follows the derived shape
  -- (<student_no>@<school>.students.invalid) so the suite exercises the real one.
  -- student_no is explicit rather than trigger-assigned so the address is
  -- deterministic. Note the trigger is max()+1 over the whole school (the same
  -- rule assign_student_roll uses), so this S9001 does move Test School A's next
  -- auto number to S9002 — deliberate, and no test depends on that sequence.
  -- `on conflict (id) do nothing` would silently accept a UUID some other seed
  -- already claimed, and then link the Student to a stranger's login. Fail loudly.
  if exists (select 1 from auth.users
              where id = uid_student and email <> 's9001@test-a.students.invalid') then
    raise exception 'seed uuid % is already another fixture', uid_student;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values
    ('00000000-0000-0000-0000-000000000000', uid_student, 'authenticated', 'authenticated',
     's9001@test-a.students.invalid', crypt('test-password-123!', gen_salt('bf', 10)), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now(),
     '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values
    (gen_random_uuid(), uid_student, uid_student,
     jsonb_build_object('sub', uid_student::text, 'email', 's9001@test-a.students.invalid',
                        'email_verified', true),
     'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  insert into public.profiles (id, role, school_id, full_name)
  values (uid_student, 'student', school_a, 'Seed Student A')
  on conflict (id) do nothing;

  insert into public.classes (school_id, name, section)
  select school_a, 'Seed Class', 'A'
   where not exists (
     select 1 from public.classes
      where school_id = school_a and name = 'Seed Class' and section = 'A');

  insert into public.students (school_id, full_name, class_name, section, student_no,
                               profile_id, guardian_name, guardian_nid, sibling_info)
  select school_a, 'Seed Student A', 'Seed Class', 'A', 'S9001', uid_student,
         'Seed Guardian', '1234567890', 'Seed Sibling, roll 7'
   where not exists (
     select 1 from public.students where school_id = school_a and student_no = 'S9001');
end $$;

-- ---------------------------------------------------------------------------
-- Class Teacher + routine for Test School A (map #434 E2E, ADR 0017).
--
-- The student portal's home and routine screens read `routine_slots`, and
-- /school/my-classes resolves the caller through `employees.profile_id`. Without
-- both, every student-facing E2E spec asserts against an empty page and passes
-- for the wrong reason.
do $$
declare
  school_a    uuid;
  -- NOT 7777…7777: that uuid is agent-e2e@test.local in e2e-seed.sql.
  uid_teacher uuid := '7c000000-7c00-4c00-8c00-7c0000000001';
  emp_teacher uuid := '7c000000-7c00-4c00-8c00-7c0000000011';
  emp_subject uuid := '7c000000-7c00-4c00-8c00-7c0000000012';
  cls         uuid;
  subj        uuid;
begin
  select id into school_a from public.schools where name = 'Test School A';
  if school_a is null then return; end if;

  select id into cls from public.classes
   where school_id = school_a and name = 'Seed Class' and section = 'A';

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', uid_teacher, 'authenticated', 'authenticated',
          'teacher-e2e@test.local',
          crypt('test-password-123!', gen_salt('bf', 10)), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(),
          '', '', '', '', '', '', '', '')
  on conflict (id) do update set encrypted_password = excluded.encrypted_password;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid_teacher, uid_teacher,
          jsonb_build_object('sub', uid_teacher::text, 'email', 'teacher-e2e@test.local',
                             'email_verified', true),
          'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  insert into public.profiles (id, role, school_id, full_name)
  values (uid_teacher, 'staff_user', school_a, 'Seed Class Teacher')
  on conflict (id) do update set role = excluded.role, school_id = excluded.school_id;

  -- Every screen the class teacher's own specs open. ADR 0017 will make the
  -- class attachment sufficient for her own Class; until then the Grant is the
  -- only gate.
  insert into public.staff_permissions (staff_user_id, screen_key)
  select uid_teacher, k
    from unnest(array['classes','attendance','exams','students','notices']) as k
  on conflict do nothing;

  insert into public.employees (id, school_id, full_name, category, profile_id)
  values (emp_teacher, school_a, 'Seed Class Teacher', 'Teacher', uid_teacher)
  on conflict (id) do update set profile_id = excluded.profile_id;

  -- A second teacher who appears in the routine without being Class Teacher —
  -- the Subject Teacher case (ADR 0017).
  insert into public.employees (id, school_id, full_name, category)
  values (emp_subject, school_a, 'Seed Subject Teacher', 'Teacher')
  on conflict (id) do nothing;

  update public.classes set class_teacher_id = emp_teacher where id = cls;

  select id into subj from public.subjects where school_id = school_a limit 1;
  if subj is null then
    insert into public.subjects (school_id, name, theory_marks)
    values (school_a, 'Seed Subject', 100) returning id into subj;
  end if;

  -- Sunday–Thursday, three periods. The teacher-conflict constraint forbids one
  -- teacher in two rooms at one period, so the two alternate.
  insert into public.routine_slots (school_id, class_id, day_of_week, period, subject_id, teacher_id)
  select school_a, cls, d.day, p.period, subj,
         case when p.period % 2 = 0 then emp_subject else emp_teacher end
    from generate_series(0, 4) as d(day), generate_series(1, 3) as p(period)
  on conflict (class_id, day_of_week, period) do nothing;
  -- A routine is invisible to Students until it is PUBLISHED — student_routine
  -- joins class_routines on published_at is not null. Slots alone leave every
  -- student-facing routine screen empty, which is correct product behaviour and
  -- a trap for a fixture.
  insert into public.class_routines (class_id, school_id, published_at)
  values (cls, school_a, now())
  on conflict (class_id) do update set published_at = coalesce(class_routines.published_at, now());
end $$;
