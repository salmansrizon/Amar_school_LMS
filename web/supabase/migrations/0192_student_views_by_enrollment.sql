-- 0192_student_views_by_enrollment.sql
-- Issue #593 -- found by code review against 0189-0191, not by the original
-- grilling session: four more Student-facing views resolve "which Class
-- Offering am I in" via the identical (name, section) text join
-- class_teacher_profile_for and the students write-policy used, before this
-- ticket's own earlier migrations moved those two onto the Student's
-- current Enrollment. 0190's widened uniqueness key permits two Offerings
-- to share a name+section (a Morning and a Day "Nine - A", say); any view
-- still matching on that text pair alone would return BOTH Offerings'
-- data merged for an affected Student -- her own subjects mixed with the
-- other shift's, her own routine mixed with the other shift's class'
-- routine, and so on. Fixed here, before this widening is allowed to stand
-- unaudited any longer.
--
-- Every WITH (security_invoker=off, security_barrier=true) is reapplied
-- explicitly -- omitting it on a CREATE OR REPLACE VIEW silently resets it
-- to the default, which is exactly what turned into a real cross-tenant
-- leak on task_completion_roster earlier in this same map's work (Wave 4a,
-- #587). Never omit it on a replace of any of these views.

-- student_subject_option (0141-era) -- the subject picker a Student's
-- question ("ask my teacher") is anchored to (askQuestion,
-- web/lib/student/messages-source.ts). Resolved via her current
-- Enrollment's own class_offering_id now, an exact single-row match by
-- construction, not a text pair that can now match two rows.
create or replace view public.student_subject_option
  with (security_invoker = off, security_barrier = true) as
  select distinct s.id,
    s.name
   from subjects s
     join class_offerings c on c.id = s.class_id
     join students me on me.profile_id = auth.uid() and me.archived_at is null and me.school_id = c.school_id
     join student_enrollments se on se.id = me.current_enrollment_id and se.class_offering_id = c.id;

-- student_routine -- the Student's own weekly routine.
create or replace view public.student_routine
  with (security_invoker = off, security_barrier = true) as
  select rs.day_of_week,
    rs.period,
    sub.name as subject_name,
    emp.full_name as teacher_name,
    rm.name as room_name
   from routine_slots rs
     join class_routines cr on cr.class_id = rs.class_offering_id and cr.published_at is not null
     join class_offerings c on c.id = rs.class_offering_id
     join students me on me.profile_id = auth.uid() and me.archived_at is null and me.school_id = c.school_id
     join student_enrollments se on se.id = me.current_enrollment_id and se.class_offering_id = c.id
     left join subjects sub on sub.id = rs.subject_id
     left join employees emp on emp.id = rs.teacher_id
     left join rooms rm on rm.id = rs.room_id;

-- student_exam_routine -- the Student's own exam schedule.
create or replace view public.student_exam_routine
  with (security_invoker = off, security_barrier = true) as
  select e.id as exam_id,
    e.name as exam_name,
    e.exam_year,
    r.exam_date,
    extract(dow from r.exam_date)::integer as day_of_week,
    r.start_time,
    r.end_time,
    sub.name as subject_name,
    rm.name as room_name
   from exam_routine_entries r
     join exams e on e.id = r.exam_id
     join class_offerings c on c.id = e.class_id
     join students me on me.profile_id = auth.uid() and me.archived_at is null and me.school_id = c.school_id
     join student_enrollments se on se.id = me.current_enrollment_id and se.class_offering_id = c.id
     left join subjects sub on sub.id = r.subject_id
     left join rooms rm on rm.id = r.room_id;

-- student_material -- only its syllabus UNION branch used the text join
-- (the publications branch already calls student_matches_target(), fixed
-- by 0188). Same shape otherwise, unchanged columns.
create or replace view public.student_material
  with (security_invoker = off, security_barrier = true) as
  select p.id,
    'publication'::text as source,
    p.kind,
    p.title,
    p.content,
    p.image_path as storage_path,
    null::text as file_name,
    p.link_url,
    p.created_at as posted_at,
    author.full_name as posted_by
   from publications p
     left join profiles author on author.id = p.created_by
  where p.kind = any (array['lesson_plan'::text, 'daily_lesson'::text, 'exam_prep'::text])
    and p.school_id = app_current_student_school_id()
    and (p.target_type = 'all'::text or student_matches_target(p.school_id, p.target_class_name, p.target_section))
  union all
  select cs.class_id as id,
    'syllabus'::text as source,
    'syllabus'::text as kind,
    cs.file_name as title,
    null::text as content,
    cs.storage_path,
    cs.file_name,
    null::text as link_url,
    cs.uploaded_at as posted_at,
    null::text as posted_by
   from class_syllabi cs
     join class_offerings c on c.id = cs.class_id
     join students me on me.profile_id = auth.uid() and me.archived_at is null and me.school_id = c.school_id
     join student_enrollments se on se.id = me.current_enrollment_id and se.class_offering_id = c.id;
