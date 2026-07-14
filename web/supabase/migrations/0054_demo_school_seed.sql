-- 0054_demo_school_seed.sql
-- Demo data for an end-to-end School Owner walkthrough (issue #71).
-- Idempotent: fixed UUIDs + ON CONFLICT guards; bulk leaf rows gated on absence.
-- Additive only (shared staging+main DB). Seeds ONE clean demo school:
--   Owner login: demo.owner@amarschool.test / DemoOwner#2026
--   Staff login: demo.staff@amarschool.test / DemoStaff#2026  (screens: students, attendance, exams)
-- All rows carry explicit school_id because app_current_school_id() is null under
-- service-role SQL (it reads profiles.school_id via auth.uid()).

-- ---------------------------------------------------------------------------
-- Fixed identifiers
-- ---------------------------------------------------------------------------
-- school   dab00000-0000-4000-a000-000000000001
-- owner    dab00000-0000-4000-a000-000000000010
-- staff    dab00000-0000-4000-a000-000000000011
-- shift AM dab00000-0000-4000-a000-000000000020
-- shift PM dab00000-0000-4000-a000-000000000021
-- grading  dab00000-0000-4000-a000-000000000030
-- exam     dab00000-0000-4000-a000-000000000040
-- classes  dab00000-0000-4000-a000-00000000020{1..6}
-- subjects dab00000-0000-4000-a000-00000000010{1..7}

-- ===========================================================================
-- 1. Auth users (owner + staff)
-- ===========================================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', 'dab00000-0000-4000-a000-000000000010',
   'authenticated', 'authenticated', 'demo.owner@amarschool.test',
   crypt('DemoOwner#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Rahim Uddin (Owner)"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dab00000-0000-4000-a000-000000000011',
   'authenticated', 'authenticated', 'demo.staff@amarschool.test',
   crypt('DemoStaff#2026', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Karim Mia (Staff)"}',
   now(), now(), '', '', '', '')
on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  ('dab00000-0000-4000-a000-0000000000a0', 'dab00000-0000-4000-a000-000000000010',
   'dab00000-0000-4000-a000-000000000010',
   jsonb_build_object('sub','dab00000-0000-4000-a000-000000000010','email','demo.owner@amarschool.test'),
   'email', now(), now(), now()),
  ('dab00000-0000-4000-a000-0000000000a1', 'dab00000-0000-4000-a000-000000000011',
   'dab00000-0000-4000-a000-000000000011',
   jsonb_build_object('sub','dab00000-0000-4000-a000-000000000011','email','demo.staff@amarschool.test'),
   'email', now(), now(), now())
on conflict (id) do nothing;

-- ===========================================================================
-- 2. School + profiles
-- ===========================================================================
insert into schools (id, name, institute_code, eiin_no, mpo_enlisted, education_levels, automatic_attendance_enabled)
values ('dab00000-0000-4000-a000-000000000001', 'Adarsha Model School (Demo)',
        'DEMO-001', '123456', true, array['primary','secondary'], true)
on conflict (id) do nothing;

insert into profiles (id, role, school_id, full_name) values
  ('dab00000-0000-4000-a000-000000000010', 'school_owner', 'dab00000-0000-4000-a000-000000000001', 'Rahim Uddin'),
  ('dab00000-0000-4000-a000-000000000011', 'staff_user',   'dab00000-0000-4000-a000-000000000001', 'Karim Mia')
on conflict (id) do update set role = excluded.role, school_id = excluded.school_id, full_name = excluded.full_name;

-- Staff screen grants (subset — demonstrates owner-vs-staff gating).
insert into staff_permissions (staff_user_id, screen_key) values
  ('dab00000-0000-4000-a000-000000000011', 'students'),
  ('dab00000-0000-4000-a000-000000000011', 'attendance'),
  ('dab00000-0000-4000-a000-000000000011', 'exams')
on conflict do nothing;

-- ===========================================================================
-- 3. Shifts, classes, rooms, subjects
-- ===========================================================================
insert into shifts (id, school_id, name, grace_minutes, starts_at, ends_at) values
  ('dab00000-0000-4000-a000-000000000020', 'dab00000-0000-4000-a000-000000000001', 'Morning', 10, '08:00', '12:00'),
  ('dab00000-0000-4000-a000-000000000021', 'dab00000-0000-4000-a000-000000000001', 'Day',     10, '12:30', '16:30')
on conflict (id) do nothing;

insert into classes (id, school_id, name, section, education_level, group_department, is_final_class) values
  ('dab00000-0000-4000-a000-000000000201', 'dab00000-0000-4000-a000-000000000001', 'Six',   'A', 'secondary', null,         false),
  ('dab00000-0000-4000-a000-000000000202', 'dab00000-0000-4000-a000-000000000001', 'Seven', 'A', 'secondary', null,         false),
  ('dab00000-0000-4000-a000-000000000203', 'dab00000-0000-4000-a000-000000000001', 'Eight', 'A', 'secondary', null,         false),
  ('dab00000-0000-4000-a000-000000000204', 'dab00000-0000-4000-a000-000000000001', 'Nine',  'A', 'secondary', 'Science',    false),
  ('dab00000-0000-4000-a000-000000000205', 'dab00000-0000-4000-a000-000000000001', 'Nine',  'B', 'secondary', 'Humanities', false),
  ('dab00000-0000-4000-a000-000000000206', 'dab00000-0000-4000-a000-000000000001', 'Ten',   'A', 'secondary', 'Science',    true)
on conflict (id) do nothing;

insert into rooms (id, school_id, name, capacity, is_active) values
  ('dab00000-0000-4000-a000-000000000301', 'dab00000-0000-4000-a000-000000000001', 'Room 101', 40, true),
  ('dab00000-0000-4000-a000-000000000302', 'dab00000-0000-4000-a000-000000000001', 'Room 102', 40, true),
  ('dab00000-0000-4000-a000-000000000303', 'dab00000-0000-4000-a000-000000000001', 'Hall A',   80, true)
on conflict (id) do nothing;

-- School-wide subjects (class_id null => applies to all classes).
insert into subjects (id, school_id, name, code, theory_marks, mcq_marks, practical_marks, paper_count) values
  ('dab00000-0000-4000-a000-000000000101', 'dab00000-0000-4000-a000-000000000001', 'Bangla',         '101', 70, 30, 0,  1),
  ('dab00000-0000-4000-a000-000000000102', 'dab00000-0000-4000-a000-000000000001', 'English',        '107', 70, 30, 0,  1),
  ('dab00000-0000-4000-a000-000000000103', 'dab00000-0000-4000-a000-000000000001', 'Mathematics',    '109', 70, 30, 0,  1),
  ('dab00000-0000-4000-a000-000000000104', 'dab00000-0000-4000-a000-000000000001', 'Science',        '127', 50, 25, 25, 1),
  ('dab00000-0000-4000-a000-000000000105', 'dab00000-0000-4000-a000-000000000001', 'Social Science', '150', 70, 30, 0,  1),
  ('dab00000-0000-4000-a000-000000000106', 'dab00000-0000-4000-a000-000000000001', 'Religion',       '111', 70, 30, 0,  1),
  ('dab00000-0000-4000-a000-000000000107', 'dab00000-0000-4000-a000-000000000001', 'ICT',            '154', 25, 25, 0,  1)
on conflict (id) do nothing;

-- ===========================================================================
-- 4. Grading scheme + bands
-- ===========================================================================
insert into grading_schemes (id, school_id, name, scheme_type, pass_mark_percent, pass_rule_strategy, combine_subject_groups)
values ('dab00000-0000-4000-a000-000000000030', 'dab00000-0000-4000-a000-000000000001',
        'Standard GPA-5', 'grade_point', 33, 'individual', false)
on conflict (id) do nothing;

insert into grade_bands (grading_scheme_id, school_id, label, min_percent, max_percent, grade_point, sort_order)
select 'dab00000-0000-4000-a000-000000000030', 'dab00000-0000-4000-a000-000000000001', b.label, b.mn, b.mx, b.gp, b.so
from (values
  ('A+', 80, 100, 5.0, 1),
  ('A',  70, 79,  4.0, 2),
  ('A-', 60, 69,  3.5, 3),
  ('B',  50, 59,  3.0, 4),
  ('C',  40, 49,  2.0, 5),
  ('D',  33, 39,  1.0, 6),
  ('F',  0,  32,  0.0, 7)
) as b(label, mn, mx, gp, so)
where not exists (
  select 1 from grade_bands where grading_scheme_id = 'dab00000-0000-4000-a000-000000000030'
);

-- ===========================================================================
-- 5. Exam (open) for Class Ten A
-- ===========================================================================
insert into exams (id, school_id, name, exam_year, status, class_id, start_date, grading_scheme_id)
values ('dab00000-0000-4000-a000-000000000040', 'dab00000-0000-4000-a000-000000000001',
        'First Term Examination', 2026, 'open',
        'dab00000-0000-4000-a000-000000000206', date '2026-04-10',
        'dab00000-0000-4000-a000-000000000030')
on conflict (id) do nothing;

-- ===========================================================================
-- 6. Fee structures (monthly tuition per class, 2026)
-- ===========================================================================
insert into fee_structures (school_id, class_id, academic_year, fee_type, amount, fine_per_absent_day)
select 'dab00000-0000-4000-a000-000000000001', c.id, 2026, 'monthly', c.fee, 10
from (values
  ('dab00000-0000-4000-a000-000000000201'::uuid, 500),
  ('dab00000-0000-4000-a000-000000000202'::uuid, 550),
  ('dab00000-0000-4000-a000-000000000203'::uuid, 600),
  ('dab00000-0000-4000-a000-000000000204'::uuid, 700),
  ('dab00000-0000-4000-a000-000000000205'::uuid, 700),
  ('dab00000-0000-4000-a000-000000000206'::uuid, 800)
) as c(id, fee)
where not exists (
  select 1 from fee_structures where school_id = 'dab00000-0000-4000-a000-000000000001' and academic_year = 2026
);

-- ===========================================================================
-- 7. Employees (teachers/staff) + shift links
-- ===========================================================================
insert into employees (id, school_id, full_name, category, mobile, date_of_birth, joining_date,
                       qualification, department, subject_taught) values
  ('dab00000-0000-4000-a000-000000000401', 'dab00000-0000-4000-a000-000000000001', 'Abdul Karim',   'Teacher',    '01710000001', '1985-01-15', '2015-01-01', 'M.A. in Bangla',   'Bangla',      'Bangla'),
  ('dab00000-0000-4000-a000-000000000402', 'dab00000-0000-4000-a000-000000000001', 'Fatema Begum',  'Teacher',    '01710000002', '1988-03-20', '2016-06-01', 'M.A. in English',  'English',     'English'),
  ('dab00000-0000-4000-a000-000000000403', 'dab00000-0000-4000-a000-000000000001', 'Jamal Hossain', 'Teacher',    '01710000003', '1983-07-10', '2014-02-01', 'M.Sc. in Math',    'Mathematics', 'Mathematics'),
  ('dab00000-0000-4000-a000-000000000404', 'dab00000-0000-4000-a000-000000000001', 'Nasrin Akter',  'Teacher',    '01710000004', '1990-11-05', '2018-01-10', 'M.Sc. in Physics', 'Science',     'Science'),
  ('dab00000-0000-4000-a000-000000000405', 'dab00000-0000-4000-a000-000000000001', 'Sultan Ahmed',  'Head Teacher','01710000005', '1978-05-25', '2010-01-01', 'M.A., B.Ed.',      'Administration','—'),
  ('dab00000-0000-4000-a000-000000000406', 'dab00000-0000-4000-a000-000000000001', 'Ruma Khatun',   'Office Staff','01710000006', '1992-09-14', '2019-03-01', 'B.Com.',           'Accounts',    '—')
on conflict (id) do nothing;

insert into employee_shifts (employee_id, shift_id)
select e, 'dab00000-0000-4000-a000-000000000020'::uuid
from unnest(array[
  'dab00000-0000-4000-a000-000000000401','dab00000-0000-4000-a000-000000000402',
  'dab00000-0000-4000-a000-000000000403','dab00000-0000-4000-a000-000000000404',
  'dab00000-0000-4000-a000-000000000405','dab00000-0000-4000-a000-000000000406']::uuid[]) e
on conflict do nothing;

-- ===========================================================================
-- 8. Bulk leaf rows (students + dependents) — gated on absence
-- ===========================================================================
do $$
declare
  sch uuid := 'dab00000-0000-4000-a000-000000000001';
  am  uuid := 'dab00000-0000-4000-a000-000000000020';
  exm uuid := 'dab00000-0000-4000-a000-000000000040';
begin
  if exists (select 1 from students where school_id = sch) then
    raise notice 'demo students already seeded; skipping bulk block';
    return;
  end if;

  -- Students (roll auto-assigned by assign_student_roll trigger).
  insert into students (school_id, full_name, class_name, section, shift_id, gender, date_of_birth,
                        religion, guardian_name, guardian_relation, guardian_mobile, guardian_phone, village, district)
  select sch, s.full_name, s.class_name, s.section, am, s.gender, s.dob::date,
         s.religion, s.guardian, 'Father', s.mobile, s.mobile, 'Rampura', 'Dhaka'
  from (values
    ('Aminul Islam',   'Six',   'A', 'Male',   '2013-02-11', 'Islam', 'Rafiqul Islam',  '01810000001'),
    ('Sadia Akter',    'Six',   'A', 'Female', '2013-05-19', 'Islam', 'Kamal Hossain',  '01810000002'),
    ('Tanvir Ahmed',   'Six',   'A', 'Male',   '2013-08-23', 'Islam', 'Belal Ahmed',    '01810000003'),
    ('Mitu Rani',      'Six',   'A', 'Female', '2013-01-30', 'Hindu', 'Nirmal Das',     '01810000004'),
    ('Rakib Hasan',    'Seven', 'A', 'Male',   '2012-04-12', 'Islam', 'Jahangir Alam',  '01810000005'),
    ('Nusrat Jahan',   'Seven', 'A', 'Female', '2012-06-25', 'Islam', 'Anwar Hossain',  '01810000006'),
    ('Sabbir Khan',    'Seven', 'A', 'Male',   '2012-09-09', 'Islam', 'Mizanur Khan',   '01810000007'),
    ('Popy Akter',     'Seven', 'A', 'Female', '2012-11-17', 'Islam', 'Shahin Mia',     '01810000008'),
    ('Hasibul Islam',  'Eight', 'A', 'Male',   '2011-03-03', 'Islam', 'Nurul Islam',    '01810000009'),
    ('Jannatul Ferdous','Eight','A', 'Female', '2011-07-21', 'Islam', 'Faruk Ahmed',    '01810000010'),
    ('Shakib Al Hasan','Eight', 'A', 'Male',   '2011-10-14', 'Islam', 'Masud Rana',     '01810000011'),
    ('Rima Das',       'Eight', 'A', 'Female', '2011-12-28', 'Hindu', 'Sujan Das',      '01810000012'),
    ('Arif Hossain',   'Nine',  'A', 'Male',   '2010-02-08', 'Islam', 'Delwar Hossain', '01810000013'),
    ('Sumaiya Islam',  'Nine',  'A', 'Female', '2010-05-16', 'Islam', 'Habibur Rahman', '01810000014'),
    ('Nayeem Uddin',   'Nine',  'A', 'Male',   '2010-08-30', 'Islam', 'Salam Uddin',    '01810000015'),
    ('Tania Akter',    'Nine',  'A', 'Female', '2010-11-11', 'Islam', 'Bashir Ahmed',   '01810000016'),
    ('Rahat Khan',     'Nine',  'B', 'Male',   '2010-01-19', 'Islam', 'Iqbal Khan',     '01810000017'),
    ('Moni Rani',      'Nine',  'B', 'Female', '2010-04-27', 'Hindu', 'Gopal Chandra',  '01810000018'),
    ('Fahim Ahmed',    'Nine',  'B', 'Male',   '2010-07-07', 'Islam', ' Shafiq Ahmed',  '01810000019'),
    ('Lamia Sultana',  'Nine',  'B', 'Female', '2010-09-22', 'Islam', 'Kabir Hossain',  '01810000020'),
    ('Imran Hossain',  'Ten',   'A', 'Male',   '2009-02-14', 'Islam', 'Sohel Rana',     '01810000021'),
    ('Sharmin Akter',  'Ten',   'A', 'Female', '2009-05-02', 'Islam', 'Alamgir Hossain','01810000022'),
    ('Rasel Mia',      'Ten',   'A', 'Male',   '2009-08-18', 'Islam', 'Jasim Uddin',    '01810000023'),
    ('Priya Das',      'Ten',   'A', 'Female', '2009-10-26', 'Hindu', 'Ratan Das',      '01810000024'),
    ('Mahmudul Hasan', 'Ten',   'A', 'Male',   '2009-12-06', 'Islam', 'Kamrul Hasan',   '01810000025'),
    ('Ayesha Siddika', 'Ten',   'A', 'Female', '2009-03-29', 'Islam', 'Monir Hossain',  '01810000026')
  ) as s(full_name, class_name, section, gender, dob, religion, guardian, mobile);

  -- Every student takes the 6 core subjects (ICT optional, skipped here).
  insert into student_subjects (student_id, subject_id, school_id, is_optional)
  select st.id, sub.id, sch, false
  from students st
  cross join subjects sub
  where st.school_id = sch
    and sub.school_id = sch
    and sub.name in ('Bangla','English','Mathematics','Science','Social Science','Religion')
  on conflict do nothing;

  -- Fee collections: Jan–May 2026, ~first half of each class paid, some dues.
  insert into fee_collection_records (school_id, student_id, month, year, pay_amount, fine_amount, adjust_amount, due_amount, payment_method, note)
  select sch, st.id, m.month, 2026,
         fs.amount,
         case when m.month = 5 and (st.roll_number % 3 = 0) then 20 else 0 end,
         0,
         case when m.month = 5 and (st.roll_number % 4 = 0) then fs.amount else 0 end,
         'cash', null
  from students st
  join classes c on c.school_id = sch and c.name = st.class_name and c.section = st.section
  join fee_structures fs on fs.class_id = c.id and fs.academic_year = 2026
  cross join generate_series(1, 5) as m(month)
  where st.school_id = sch
    and not (m.month = 5 and (st.roll_number % 4 = 0))  -- unpaid May for the "due" students
  on conflict do nothing;

  -- Exam marks for Class Ten A across the 6 core subjects.
  -- obtained_marks is a GENERATED column — do not insert it.
  insert into exam_marks (exam_id, school_id, student_id, subject_id, theory_obtained, mcq_obtained, practical_obtained, entered_by)
  select exm, sch, st.id, sub.id,
         least(sub.theory_marks,    floor(sub.theory_marks    * 0.55) + (st.roll_number * 3 % 15))::numeric,
         least(sub.mcq_marks,       floor(sub.mcq_marks       * 0.60) + (st.roll_number * 2 % 10))::numeric,
         least(sub.practical_marks, case when sub.practical_marks > 0 then floor(sub.practical_marks * 0.75) else 0 end)::numeric,
         'dab00000-0000-4000-a000-000000000405'  -- entered_by must be an employees.id (head teacher)
  from students st
  cross join subjects sub
  where st.school_id = sch and st.class_name = 'Ten'
    and sub.school_id = sch
    and sub.name in ('Bangla','English','Mathematics','Science','Social Science','Religion')
  on conflict do nothing;

  -- Attendance: last 5 weekdays, students present, a couple absent (no row).
  insert into attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
  select sch, 'student', st.id, d::date,
         (d + time '08:05')::timestamptz, (d + time '12:00')::timestamptz, 'on_time'
  from students st
  cross join generate_series(current_date - 6, current_date - 1, interval '1 day') as d
  where st.school_id = sch
    and extract(dow from d) not in (5, 6)          -- skip Fri/Sat weekend
    and not (st.roll_number % 7 = 0 and d::date = current_date - 1)  -- a few absent yesterday
  on conflict do nothing;

  -- Employee attendance for the same window.
  insert into attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
  select sch, 'employee', e.id, d::date,
         (d + time '07:55')::timestamptz, (d + time '16:30')::timestamptz, 'on_time'
  from employees e
  cross join generate_series(current_date - 6, current_date - 1, interval '1 day') as d
  where e.school_id = sch and extract(dow from d) not in (5, 6)
  on conflict do nothing;

  -- Behaviour log (2 entries) — feeds progress-report behaviour rating.
  insert into behaviour_log_entries (student_id, note, rating)
  select st.id, 'Consistently helpful and attentive in class.', 5
  from students st where st.school_id = sch and st.class_name = 'Ten' order by st.roll_number limit 1;
  insert into behaviour_log_entries (student_id, note, rating)
  select st.id, 'Needs to submit homework on time.', 3
  from students st where st.school_id = sch and st.class_name = 'Nine' and st.section = 'A' order by st.roll_number limit 1;
end $$;

-- ===========================================================================
-- 9. Publications (notices / homework), feedback, ratings
-- ===========================================================================
insert into publications (school_id, kind, title, content, importance, target_type, created_by)
select 'dab00000-0000-4000-a000-000000000001', p.kind, p.title, p.content, p.importance, 'all',
       'dab00000-0000-4000-a000-000000000010'
from (values
  ('notice',   'Annual Sports Day on 20 March', 'All students must assemble at the field by 8:00 AM.', 'important'),
  ('notice',   'First Term Exam Routine Published', 'Check the exam routine on the notice board.', 'urgent'),
  ('homework', 'Mathematics Homework — Class Ten', 'Complete exercises 4.1 to 4.5 by Sunday.', 'normal')
) as p(kind, title, content, importance)
where not exists (
  select 1 from publications where school_id = 'dab00000-0000-4000-a000-000000000001'
);

insert into feedback_messages (school_id, sender_name, sender_role, sender_contact, subject, body, status, read_at)
select 'dab00000-0000-4000-a000-000000000001', f.name, f.role, f.contact, f.subject, f.body, f.status,
       case when f.status <> 'unread' then now() else null end
from (values
  ('Salma Parvin', 'Guardian', '01910000001', 'Bus route request', 'Please add a bus stop near Rampura bridge.', 'unread'),
  ('Nazrul Islam', 'Guardian', '01910000002', 'Thanks to the teachers', 'Grateful for the extra care given to my son.', 'read'),
  ('Rehana Begum', 'Guardian', '01910000003', 'Fee payment query', 'Can fees be paid online next term?', 'answered')
) as f(name, role, contact, subject, body, status)
where not exists (
  select 1 from feedback_messages where school_id = 'dab00000-0000-4000-a000-000000000001'
);

insert into satisfaction_ratings (scope, school_id, overall_rating, category_teaching, category_facilities, category_communication, category_safety, sender_name)
select 'institute', 'dab00000-0000-4000-a000-000000000001', r.o, r.t, r.f, r.c, r.s, r.name
from (values
  (5, 5, 4, 5, 5, 'Salma Parvin'),
  (4, 4, 3, 4, 4, 'Nazrul Islam'),
  (5, 5, 5, 4, 5, 'Anonymous')
) as r(o, t, f, c, s, name)
where not exists (
  select 1 from satisfaction_ratings where school_id = 'dab00000-0000-4000-a000-000000000001'
);
