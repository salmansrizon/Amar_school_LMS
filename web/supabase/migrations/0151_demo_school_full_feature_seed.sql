-- 0151_demo_school_full_feature_seed.sql
--
-- The demo School (0054, subdomain `adarshamodelschool`) already carries classes,
-- students, employees, subjects, exams, notices and fee structures. What it never
-- got is everything map #434 added: no Class Teacher, no Employee login, no
-- Student login, and one lonely routine slot — so /student/* and /school/my-classes
-- cannot be opened by anyone at all.
--
-- This completes it, so every role in the product has a credential on one School.
--
-- Auth rows are written directly, copying create_student_login's column list
-- verbatim (#437): the RPCs gate on `can_manage_student_login`, which needs a
-- School Owner's session, and a migration has none.
--
-- Idempotent: fixed UUIDs, every insert takes `on conflict do nothing/update`.

do $$
declare
  v_school   uuid;
  v_class    uuid := 'dab00000-0000-4000-a000-000000000203';  -- Eight / Day - A
  v_teacher  uuid := 'dab00000-0000-4000-a000-000000000401';  -- Abdul Karim
  v_subject_teacher uuid := 'dab00000-0000-4000-a000-000000000402'; -- Fatema Begum
  v_teacher_uid uuid := 'dab00000-0000-4000-b000-000000000001';
  v_student  uuid;
  v_student_uid uuid := 'dab00000-0000-4000-b000-000000000002';
  v_addr     text;
begin
  select id into v_school from public.schools where subdomain = 'adarshamodelschool';
  if v_school is null then
    raise notice 'demo school not present; nothing to seed';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 1. The School must have a login domain before any Student address exists.
  -- Set directly, not via student_login_domain(id): that function resolves AND
  -- stores, so calling it inside an UPDATE on the same row trips
  -- "tuple to be updated was already modified by an operation triggered by the
  -- current command". The demo School has a subdomain, which is what it returns.
  update public.schools
     set student_login_domain = coalesce(student_login_domain, subdomain)
   where id = v_school;

  -- -------------------------------------------------------------------------
  -- 2. A Class Teacher who can actually sign in.
  --
  -- Two halves, per #435: the Class points at an `employees` row, and that row
  -- points at a Staff User login through `profile_id`.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at,
                          confirmation_token, recovery_token, email_change,
                          email_change_token_new, email_change_token_current,
                          phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_teacher_uid, 'authenticated', 'authenticated',
          'demo.teacher@amarschool.test',
          extensions.crypt('DemoTeacher#2026', extensions.gen_salt('bf', 10)), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(),
          '', '', '', '', '', '', '', '')
  on conflict (id) do update set encrypted_password = excluded.encrypted_password;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  values (v_teacher_uid, v_teacher_uid, v_teacher_uid,
          jsonb_build_object('sub', v_teacher_uid::text,
                             'email', 'demo.teacher@amarschool.test',
                             'email_verified', true),
          'email', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.profiles (id, role, school_id, full_name)
  values (v_teacher_uid, 'staff_user', v_school, 'Abdul Karim')
  on conflict (id) do update set role = excluded.role, school_id = excluded.school_id;

  update public.employees set profile_id = v_teacher_uid where id = v_teacher;
  update public.classes     set class_teacher_id = v_teacher where id = v_class;

  -- Screens the Class Teacher needs today. ADR 0017 will make the class
  -- attachment sufficient on its own for her own Class; until that ships, the
  -- Grant is still the only gate and she would see an empty shell without it.
  insert into public.staff_permissions (staff_user_id, screen_key)
  select v_teacher_uid, k
    from unnest(array['classes','attendance','exams','students','notices']) as k
  on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- 3. A Student who can sign in, in that same Class.
  select id into v_student
    from public.students
   where school_id = v_school and student_no = 'S0022' and archived_at is null;

  if v_student is not null then
    v_addr := lower('S0022') || '@'
           || public.student_login_domain(v_school) || '.students.invalid';

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at,
                            confirmation_token, recovery_token, email_change,
                            email_change_token_new, email_change_token_current,
                            phone_change, phone_change_token, reauthentication_token)
    values ('00000000-0000-0000-0000-000000000000', v_student_uid, 'authenticated', 'authenticated',
            v_addr,
            extensions.crypt('DemoStudent#2026', extensions.gen_salt('bf', 10)), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(),
            '', '', '', '', '', '', '', '')
    on conflict (id) do update set encrypted_password = excluded.encrypted_password,
                                   email = excluded.email;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (v_student_uid, v_student_uid, v_student_uid,
            jsonb_build_object('sub', v_student_uid::text, 'email', v_addr,
                               'email_verified', true),
            'email', now(), now(), now())
    on conflict (id) do nothing;

    insert into public.profiles (id, role, school_id, full_name)
    values (v_student_uid, 'student', v_school, 'Hasibul Islam')
    on conflict (id) do update set role = excluded.role, school_id = excluded.school_id;

    update public.students set profile_id = v_student_uid where id = v_student;
  end if;

  -- -------------------------------------------------------------------------
  -- 4. A routine worth reading.
  --
  -- The Student home shows Today and Tomorrow off `routine_slots`, and one slot
  -- makes both cards empty six days a week. Sunday-Thursday, four periods a day
  -- — a Bangladeshi school week. Fatema Begum teaches two of them without being
  -- Class Teacher, which is exactly the Subject Teacher case in ADR 0017.
  -- routine_slots_teacher_conflict forbids one teacher in two places at the same
  -- period, and the demo School's single stale slot collides with the grid below.
  -- It is seed data for one class; clearing it is cheaper than threading around it.
  delete from public.routine_slots where school_id = v_school;

  insert into public.routine_slots (school_id, class_id, day_of_week, period, subject_id, teacher_id)
  select v_school, v_class, d.day, p.period,
         ('dab00000-0000-4000-a000-00000000010' || (1 + ((d.day + p.period) % 5)))::uuid,
         case when p.period % 2 = 0 then v_subject_teacher else v_teacher end
    from generate_series(0, 4) as d(day),
         generate_series(1, 4) as p(period)
  on conflict (class_id, day_of_week, period) do nothing;

  -- Publish it. student_routine joins class_routines on published_at is not
  -- null, so unpublished slots leave every student routine screen empty.
  insert into public.class_routines (class_id, school_id, published_at)
  values (v_class, v_school, now())
  on conflict (class_id) do update set published_at = coalesce(class_routines.published_at, now());
end $$;
