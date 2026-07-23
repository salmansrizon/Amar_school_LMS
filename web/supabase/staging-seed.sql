-- Staging seed data — makes the staging deployment functional for testing.
-- Run after the existing seed-test.sql has been applied (users + schools exist).
-- Idempotent: safe to re-run.
--
-- Adds: locations, students, employees, office times, exams, fee records,
--       attendance records, off-days, SMS rules, behaviour log entries.
-- All data belongs to Test School A (owner-a@test.local, password: test-password-123!).

do $$
declare
  school_a uuid;
  school_b uuid;
  sid uuid;
  eid uuid;
  office_time_id uuid;
  i int;
  d date;
begin
  select id into school_a from public.schools where name = 'Test School A';
  select id into school_b from public.schools where name = 'Test School B';
  if school_a is null then raise exception 'Test School A not found — run seed-test.sql first'; end if;

  -- ═══════════════════════════════════════════════════════════════
  -- 1. LOCATIONS — 1 division → 1 district → 1 upazila → 1 union
  -- ═══════════════════════════════════════════════════════════════
  insert into public.locations (name, type, parent_id)
  select 'Staging Division', 'division', null
  where not exists (select 1 from public.locations where name = 'Staging Division');
  insert into public.locations (name, type, parent_id)
  select 'Staging District', 'district', (select id from public.locations where name = 'Staging Division')
  where not exists (select 1 from public.locations where name = 'Staging District');
  insert into public.locations (name, type, parent_id)
  select 'Staging Upazila', 'upazila', (select id from public.locations where name = 'Staging District')
  where not exists (select 1 from public.locations where name = 'Staging Upazila');
  insert into public.locations (name, type, parent_id)
  select 'Staging Union', 'union', (select id from public.locations where name = 'Staging Upazila')
  where not exists (select 1 from public.locations where name = 'Staging Union');

  -- Link School A to the Union
  update public.schools set location_id = (select id from public.locations where name = 'Staging Union')
  where id = school_a and location_id is null;

  -- ═══════════════════════════════════════════════════════════════
  -- 2. STUDENTS — 10 students across 2 classes for School A
  -- ═══════════════════════════════════════════════════════════════
  delete from public.behaviour_log_entries
  where student_id in (select id from public.students where school_id = school_a and full_name like 'Staging %');
  delete from public.fee_collection_records
  where student_id in (select id from public.students where school_id = school_a and full_name like 'Staging %');
  delete from public.student_leaves
  where student_id in (select id from public.students where school_id = school_a and full_name like 'Staging %');
  delete from public.attendance_records
  where person_id in (select id from public.students where school_id = school_a and full_name like 'Staging %')
    and person_type = 'student';
  delete from public.students where school_id = school_a and full_name like 'Staging %';

  -- Class 1 — 5 students
  for i in 1..5 loop
    insert into public.students (school_id, full_name, class_name, section, guardian_phone)
    values (school_a,
            'Staging Student ' || (100 + i),
            'Class 1',
            case when i <= 3 then 'A' else 'B' end,
            '0171' || lpad((1000 + i)::text, 4, '0') || '000')
    returning id into sid;
  end loop;

  -- Class 2 — 5 students
  for i in 1..5 loop
    insert into public.students (school_id, full_name, class_name, section, guardian_phone)
    values (school_a,
            'Staging Student ' || (200 + i),
            'Class 2',
            case when i <= 3 then 'A' else 'B' end,
            '0172' || lpad((1000 + i)::text, 4, '0') || '000')
    returning id into sid;
  end loop;

  -- ═══════════════════════════════════════════════════════════════
  -- 3. OFFICE TIMES — 2 windows for School A
  -- ═══════════════════════════════════════════════════════════════
  delete from public.employee_office_times es
  where es.office_time_id in (select s.id from public.office_times s where s.school_id = school_a);
  delete from public.office_times s where s.school_id = school_a and s.name like 'Staging %';

  insert into public.office_times (school_id, name, grace_minutes, starts_at, ends_at)
  values (school_a, 'Staging Morning', 20, '08:00', '14:00')
  returning id into office_time_id;

  insert into public.office_times (school_id, name, grace_minutes, starts_at, ends_at)
  values (school_a, 'Staging Afternoon', 15, '12:00', '18:00');

  -- ═══════════════════════════════════════════════════════════════
  -- 4. EMPLOYEES — 5 employees for School A
  -- ═══════════════════════════════════════════════════════════════
  delete from public.employee_office_times es
  where es.employee_id in (select e.id from public.employees e where e.school_id = school_a and e.full_name like 'Staging %');
  delete from public.attendance_records
  where person_id in (select id from public.employees where school_id = school_a and full_name like 'Staging %')
    and person_type = 'employee';
  delete from public.employees where school_id = school_a and full_name like 'Staging %';

  insert into public.employees (school_id, full_name, category)
  values (school_a, 'Staging Teacher One', 'teacher')
  returning id into eid;
  insert into public.employee_office_times (employee_id, office_time_id) values (eid, office_time_id);

  insert into public.employees (school_id, full_name, category)
  values (school_a, 'Staging Teacher Two', 'teacher')
  returning id into eid;
  insert into public.employee_office_times (employee_id, office_time_id) values (eid, office_time_id);

  insert into public.employees (school_id, full_name, category)
  values (school_a, 'Staging Staff One', 'staff');

  insert into public.employees (school_id, full_name, category)
  values (school_a, 'Staging Staff Two', 'staff');

  insert into public.employees (school_id, full_name, category, grace_override_minutes)
  values (school_a, 'Staging Admin', 'admin', 10);

  -- ═══════════════════════════════════════════════════════════════
  -- 5. EXAMS — 2 exams for School A
  -- ═══════════════════════════════════════════════════════════════
  delete from public.exams
  where school_id = school_a and name like 'Staging %';

  insert into public.exams (school_id, name, exam_year)
  values (school_a, 'Staging Midterm', 2026);

  insert into public.exams (school_id, name, exam_year)
  values (school_a, 'Staging Final', 2026);

  -- ═══════════════════════════════════════════════════════════════
  -- 6. FEE RECORDS — 2 months for School A students
  -- ═══════════════════════════════════════════════════════════════
  for sid in select id from public.students where school_id = school_a and full_name like 'Staging %' loop
    insert into public.fee_collection_records (school_id, student_id, month, year, pay_amount, due_amount, payment_method)
    values (school_a, sid, 6, 2026, 500, 0, 'cash')
    on conflict (student_id, month, year) do nothing;

    insert into public.fee_collection_records (school_id, student_id, month, year, pay_amount, fine_amount, due_amount, payment_method)
    values (school_a, sid, 7, 2026, 0, 50, 550, 'cash')
    on conflict (student_id, month, year) do nothing;
  end loop;

  -- ═══════════════════════════════════════════════════════════════
  -- 7. ATTENDANCE RECORDS — last 5 working days
  -- ═══════════════════════════════════════════════════════════════
  delete from public.attendance_records
  where school_id = school_a and att_date >= '2026-07-01' and att_date <= '2026-07-08';

  -- Students: most present, some absent (for SMS testing)
  declare
    att_day date;
    att_sid uuid;
    att_counter int := 0;
  begin
    for att_day in select g::date from generate_series('2026-07-01'::date, '2026-07-07'::date, '1 day'::interval) g
              where extract(dow from g) not in (0, 6) -- skip weekends
    loop
      att_counter := att_counter + 1;
      for att_sid in select id from public.students where school_id = school_a and full_name like 'Staging %' loop
        -- Every 5th student is absent (for SMS testing)
        if att_counter % 5 = 0 then
          continue;
        end if;
        insert into public.attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
        values (school_a, 'student', att_sid, att_day,
                (att_day::timestamptz + '08:00:00'::interval),
                (att_day::timestamptz + '14:00:00'::interval),
                'present')
        on conflict (person_type, person_id, att_date) do nothing;
      end loop;
    end loop;
  end;

  -- Employees: present with statuses
  declare
    att_eid uuid;
  begin
    for att_eid in select id from public.employees where school_id = school_a and full_name like 'Staging %' loop
      insert into public.attendance_records (school_id, person_type, person_id, att_date, entry_at, exit_at, status)
      values (school_a, 'employee', att_eid, '2026-07-07',
              ('2026-07-07'::timestamptz + '07:50:00'::interval),
              ('2026-07-07'::timestamptz + '14:10:00'::interval),
              'on_time')
      on conflict (person_type, person_id, att_date) do nothing;
    end loop;
  end;

  -- ═══════════════════════════════════════════════════════════════
  -- 8. OFF-DAYS + SMS RULES — for the SMS feature
  -- ═══════════════════════════════════════════════════════════════
  delete from public.off_days where school_id = school_a;
  delete from public.absence_sms_rules where school_id = school_a;

  -- July holidays
  insert into public.off_days (school_id, day, label)
  values (school_a, '2026-07-15', 'Summer Vacation Start')
  on conflict (school_id, day) do nothing;

  insert into public.off_days (school_id, day, label)
  values (school_a, '2026-07-16', 'Summer Vacation End')
  on conflict (school_id, day) do nothing;

  -- SMS rules
  insert into public.absence_sms_rules (school_id, exact_days)
  values (school_a, 3)
  on conflict do nothing;

  insert into public.absence_sms_rules (school_id, range_from, range_to)
  values (school_a, 5, 10)
  on conflict do nothing;

  -- ═══════════════════════════════════════════════════════════════
  -- 9. BEHAVIOUR LOG — 3 entries for one student
  -- ═══════════════════════════════════════════════════════════════
  declare
    beh_sid uuid;
  begin
    select id into beh_sid from public.students
    where school_id = school_a and full_name = 'Staging Student 101'
    limit 1;

    if beh_sid is not null then
      delete from public.behaviour_log_entries
      where student_id = beh_sid and note like 'Staging %';

      insert into public.behaviour_log_entries (student_id, note, rating, remind_date)
      values (beh_sid, 'Staging: Good participation in class', 8, '2026-07-15');

      insert into public.behaviour_log_entries (student_id, note, rating, remind_date)
      values (beh_sid, 'Staging: Homework incomplete', 4, '2026-07-10');

      insert into public.behaviour_log_entries (student_id, note, rating)
      values (beh_sid, 'Staging: Helped organize class event', 9);
    end if;
  end;

  raise notice 'Staging seed complete for School A (%). Students/employees/exams/fees/attendance populated.', school_a;
end $$;