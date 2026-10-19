-- 0260_print_verification.sql
-- Every print carries a QR code that opens a public verification page.
--
-- WHAT
--   1. schools.public_token   opaque per-school token (same shape as
--                             students.public_token, migration 0065).
--   2. print_document_facts() the ONE function a QR scan calls. Unauthenticated.
--   3. print_tokens_self()    lets a signed-in Student read THEIR OWN token so
--                             the student portal can print the same QR. A
--                             Student has no SELECT on `students` and the
--                             student_self view does not carry the token.
--
-- WHY
--   Owner's decision 2026-10-08: a scan shows a verification page with a few
--   key facts and a Genuine / Not valid badge, computed live at scan time.
--   The page is public, so the database decides what may leave: the function
--   returns a fixed allow-list per document kind and reads nothing else.
--
-- THE LINK IS NOT GUESSABLE
--   Every lookup needs an opaque token (hyphen-stripped UUIDv4, 122 random
--   bits) AND, where the document has a record behind it, that record's id.
--   The function checks the record belongs to the token's student / school.
--   Unknown kind, malformed token, wrong token, wrong reference, a reference
--   from another school, a reference where none is taken: all return NULL,
--   indistinguishable to the caller. There is no rate limit (the app has
--   none); the token space is what stops enumeration.
--
-- ALLOW-LIST (keys of the returned jsonb; nothing else is ever returned)
--   every kind ......... kind, valid, reason, school_name, school_logo_path
--   Student kinds (p_token = students.public_token):
--     mark_sheet, progress_report (p_ref = exams.id, required)
--         student_name, class_name, section, roll_number, exam_name, exam_year,
--         changed_at (= results_published_at)
--         + results, ONLY when valid (published and student not archived):
--             results.complete        false when the student has no mark row
--                                     in the exam, or any of them is not
--                                     entered yet; then no totals are returned
--             results.total_obtained  sum of the student's marks in the exam
--             results.total_full      sum of the full marks of the subjects
--                                     the student has a mark row for
--           Owner's decision 2026-10-08: TOTAL MARKS ONLY. Nothing per
--           subject, no grading scheme, no GPA, no grade, no pass/fail.
--         valid = student not archived AND results published
--         reason = 'archived' | 'unpublished'
--     admit_card (p_ref = exams.id, required)
--         student_name, class_name, section, roll_number, exam_name, exam_year
--         valid = student not archived AND exam open
--         reason = 'archived' | 'exam_closed'
--     fee_receipt (p_ref = fee_collection_records.id, required)
--         student_name, class_name, section, month, year, changed_at
--         + amount, paid_at ONLY when not voided; + void_at when voided
--         valid = not voided; reason = 'voided'
--     admission_form (no ref)   student_name, class_name, section, student_no
--     student_log, fee_statement (no ref)   student_name, class_name, section
--         valid = student not archived; reason = 'archived'
--   School kinds (p_token = schools.public_token); never a student name or count:
--     exam_attendance_sheet, seat_plan, exam_routine
--         (p_ref = exams.id, required)        exam_name, exam_year
--     class_routine (p_ref = class_offerings.id, required)
--     attendance_book (p_ref = class_offerings.id, or none for a mixed sheet)
--                                             class_name, section, class_year
--     id_cards, general_ledger, template_admission, template_attendance,
--     template_exam_answer, template_homework, template_lesson_plan (no ref)
--         nothing beyond the common keys
--         valid = true whenever the row is returned
--   NEVER returned: any public_token, any id, guardian details, phone, address,
--   date of birth, photo, subject names, another school's data.
--
-- WHO CAN CALL WHAT
--   print_document_facts  anon, authenticated (and service_role by Supabase's
--                         default grant). Security definer: RLS does not apply,
--                         the body is the access control.
--   print_tokens_self     authenticated only; returns only the caller's own
--                         row (students.profile_id = auth.uid()).
--   schools.public_token  readable by whoever can already read the schools row
--                         under RLS (members, students of that school, super
--                         admin, territory roles). It unlocks nothing by itself
--                         beyond "this school exists, here is its name/logo".
--
-- EFFECT ON EXISTING DATA
--   Adding schools.public_token with a volatile per-row default REWRITES the
--   schools table under an ACCESS EXCLUSIVE lock. Accepted on purpose:
--     - schools has one row per school, so the rewrite is milliseconds;
--     - the alternative (nullable column + UPDATE backfill) fires every row
--       trigger on schools once per school, and those triggers assume an app
--       session; a rewrite fires none. 0065 made the same choice for students.
--   No existing value changes. students is not touched. The existing
--   /verify/<token> page and student_by_public_token are not touched.
--
-- PRE-CHECK (read-only; run before applying)
--   -- a. every column the function reads exists (expect 12 rows)
--   select table_name, column_name from information_schema.columns
--    where table_schema = 'public' and (table_name, column_name) in (
--      ('students','public_token'), ('students','archived_at'),
--      ('students','student_no'), ('students','roll_number'),
--      ('students','profile_id'), ('students','current_enrollment_id'),
--      ('schools','logo_path'), ('exams','results_published_at'),
--      ('exams','class_id'), ('fee_collection_records','void_at'),
--      ('class_offerings','academic_year'), ('student_enrollments','class_offering_id'))
--    order by 1, 2;
--   -- b. the column is not there yet (expect 0 rows; 1 row = already applied)
--   select 1 from information_schema.columns
--    where table_schema = 'public' and table_name = 'schools' and column_name = 'public_token';
--   -- c. how many rows the rewrite touches
--   select count(*) from public.schools;
--   -- d. no function of these names with another signature (expect 0 rows)
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('print_document_facts', 'print_tokens_self');
--
-- ROLLBACK (in this order: the functions read the column)
--   drop function if exists public.print_tokens_self();
--   drop function if exists public.print_document_facts(text, text, uuid);
--   alter table public.schools drop column if exists public_token;
--   notify pgrst, 'reload schema';
--   Printed QR codes for school kinds stop resolving and can never be
--   re-issued with the same token. Student-kind codes are unaffected by the
--   column drop but stop resolving without the function.
--
-- Idempotent.

-- 1. Opaque per-school token --------------------------------------------------

alter table public.schools
  add column if not exists public_token text not null unique
    default replace(gen_random_uuid()::text, '-', '');

comment on column public.schools.public_token is
  'Opaque token printed inside the QR of school-level documents (0260). Never the row id.';

-- 2. The scan function --------------------------------------------------------

create or replace function public.print_document_facts(
  p_kind text,
  p_token text,
  p_ref uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c_exam_kinds   constant text[] := array['exam_attendance_sheet', 'seat_plan', 'exam_routine'];
  c_class_kinds  constant text[] := array['attendance_book', 'class_routine'];
  c_school_kinds constant text[] := array['id_cards', 'general_ledger', 'template_admission',
    'template_attendance', 'template_exam_answer', 'template_homework', 'template_lesson_plan'];
  c_result_kinds constant text[] := array['mark_sheet', 'progress_report'];
  c_plain_student_kinds constant text[] := array['admission_form', 'student_log', 'fee_statement'];

  v_school_id uuid;
  v_out jsonb;

  v_student_id uuid;
  v_archived boolean;

  v_exam_name text;
  v_exam_year int;
  v_exam_open boolean;
  v_published_at timestamptz;

  v_month int;
  v_year int;
  v_amount numeric;
  v_paid_at timestamptz;
  v_void_at timestamptz;

  v_class_name text;
  v_section text;
  v_class_year int;
begin
  if p_kind is null or p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  -- School kinds --------------------------------------------------------------
  if p_kind = any (c_exam_kinds || c_class_kinds || c_school_kinds) then
    select jsonb_build_object('kind', p_kind, 'valid', true,
                              'school_name', sc.name, 'school_logo_path', sc.logo_path),
           sc.id
      into v_out, v_school_id
      from schools sc where sc.public_token = p_token;
    if v_school_id is null then return null; end if;

    if p_kind = any (c_exam_kinds) then
      select e.name, e.exam_year into v_exam_name, v_exam_year
        from exams e where e.id = p_ref and e.school_id = v_school_id;
      if not found then return null; end if;
      return v_out || jsonb_build_object('exam_name', v_exam_name, 'exam_year', v_exam_year);
    end if;

    if p_kind = any (c_class_kinds) then
      -- An attendance book over several classes has no single class behind it.
      if p_ref is null then
        if p_kind = 'attendance_book' then return v_out; end if;
        return null;
      end if;
      select c.name, c.section, c.academic_year into v_class_name, v_section, v_class_year
        from class_offerings c where c.id = p_ref and c.school_id = v_school_id;
      if not found then return null; end if;
      return v_out || jsonb_build_object('class_name', v_class_name, 'section', v_section,
                                         'class_year', v_class_year);
    end if;

    if p_ref is not null then return null; end if;
    return v_out;
  end if;

  -- Student kinds -------------------------------------------------------------
  if not (p_kind = any (c_result_kinds || c_plain_student_kinds || array['admit_card', 'fee_receipt'])) then
    return null;
  end if;

  select jsonb_build_object('kind', p_kind,
                            'school_name', sc.name, 'school_logo_path', sc.logo_path,
                            'student_name', s.full_name, 'class_name', s.class_name, 'section', s.section),
         s.id, s.school_id, s.archived_at is not null
    into v_out, v_student_id, v_school_id, v_archived
    from students s join schools sc on sc.id = s.school_id
   where s.public_token = p_token;
  if v_student_id is null then return null; end if;

  if p_kind = any (c_plain_student_kinds) then
    if p_ref is not null then return null; end if;
    if p_kind = 'admission_form' then
      v_out := v_out || (select jsonb_build_object('student_no', s.student_no) from students s where s.id = v_student_id);
    end if;
    return v_out || jsonb_build_object('valid', not v_archived,
                                       'reason', case when v_archived then 'archived' end);
  end if;

  if p_ref is null then return null; end if;

  if p_kind = 'fee_receipt' then
    select f.month, f.year, f.pay_amount, f.updated_at, f.void_at
      into v_month, v_year, v_amount, v_paid_at, v_void_at
      from fee_collection_records f
     where f.id = p_ref and f.student_id = v_student_id and f.school_id = v_school_id;
    if not found then return null; end if;
    v_out := v_out || jsonb_build_object('month', v_month, 'year', v_year,
                                         'valid', v_void_at is null,
                                         'reason', case when v_void_at is not null then 'voided' end,
                                         'changed_at', greatest(v_paid_at, v_void_at));
    if v_void_at is null then
      return v_out || jsonb_build_object('amount', v_amount, 'paid_at', v_paid_at);
    end if;
    return v_out || jsonb_build_object('void_at', v_void_at);
  end if;

  -- mark_sheet, progress_report, admit_card: an exam of the student's own
  -- school that this student actually belongs to (has a mark in it, or was
  -- ever enrolled in its class). Without the second half, any student's token
  -- plus any exam id of the school would read as a genuine document.
  select e.name, e.exam_year, e.status = 'open', e.results_published_at
    into v_exam_name, v_exam_year, v_exam_open, v_published_at
    from exams e
   where e.id = p_ref and e.school_id = v_school_id
     and (exists (select 1 from exam_marks m where m.exam_id = e.id and m.student_id = v_student_id)
          or exists (select 1 from student_enrollments en
                      where en.student_id = v_student_id and en.class_offering_id = e.class_id));
  if not found then return null; end if;

  v_out := v_out
    || (select jsonb_build_object('roll_number', s.roll_number) from students s where s.id = v_student_id)
    || jsonb_build_object('exam_name', v_exam_name, 'exam_year', v_exam_year);

  if p_kind = 'admit_card' then
    return v_out || jsonb_build_object(
      'valid', not v_archived and v_exam_open,
      'reason', case when v_archived then 'archived' when not v_exam_open then 'exam_closed' end);
  end if;

  v_out := v_out || jsonb_build_object(
    'valid', not v_archived and v_published_at is not null,
    'reason', case when v_archived then 'archived' when v_published_at is null then 'unpublished' end,
    'changed_at', v_published_at);
  if v_archived or v_published_at is null then
    return v_out;
  end if;

  -- Published: the student's totals for this exam, and nothing else. One
  -- aggregate row always comes back. No mark row, or a mark not entered yet
  -- (obtained_marks is null, 0223), is "not complete" and carries no totals.
  return v_out || jsonb_build_object('results', (
    select case
             when count(*) > 0 and count(*) = count(m.obtained_marks) then
               jsonb_build_object(
                 'complete', true,
                 'total_obtained', sum(m.obtained_marks),
                 'total_full', sum(sub.theory_marks + sub.mcq_marks + sub.practical_marks))
             else jsonb_build_object('complete', false)
           end
      from exam_marks m
      join subjects sub on sub.id = m.subject_id
     where m.exam_id = p_ref and m.student_id = v_student_id));
end;
$$;

comment on function public.print_document_facts(text, text, uuid) is
  'Public QR verification (0260): allow-listed facts for one printed document, or NULL. See the migration header for the allow-list.';

revoke all on function public.print_document_facts(text, text, uuid) from public;
grant execute on function public.print_document_facts(text, text, uuid) to anon, authenticated;

-- 3. A Student's own token ----------------------------------------------------

create or replace function public.print_tokens_self()
returns table (student_token text, class_offering_id uuid)
language sql stable security definer set search_path = public as $$
  select s.public_token, en.class_offering_id
    from students s
    left join student_enrollments en on en.id = s.current_enrollment_id
   where s.profile_id = auth.uid() and s.archived_at is null
$$;

comment on function public.print_tokens_self() is
  'The calling Student''s own public_token and current class offering, for QR codes on student-portal prints (0260).';

revoke all on function public.print_tokens_self() from public, anon;
grant execute on function public.print_tokens_self() to authenticated;

notify pgrst, 'reload schema';
