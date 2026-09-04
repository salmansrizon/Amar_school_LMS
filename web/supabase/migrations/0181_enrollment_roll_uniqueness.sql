-- 0181_enrollment_roll_uniqueness.sql
-- Wave 3 (issue #586) prerequisite, flagged explicitly by Wave 2's own
-- resolution comment (#585): "whichever part of Wave 3 starts actually
-- calling admit_student_enrollment/set_student_enrollment with real roll
-- numbers should port students_roll_unique's pattern... at the same time."
--
-- Ports assign_student_roll's advisory-lock-serialized auto-assignment (0034,
-- rescoped in 0120) and its unique-index backstop from `students` to
-- `student_enrollments`, keyed by class_offering_id instead of
-- school_id+class_name+coalesce(section,'').
--
-- class_offering_id is a single uuid (not a free-text triple), so the old
-- 0120 comment's careful three-way hash-and-XOR (guarding against a ':'-join
-- ambiguity between class_name and section) has nothing left to guard
-- against -- one hashtextextended call is enough.
--
-- Scope decision: BOTH the index and the trigger's max() are restricted to
-- OPEN enrollments (closed_at is null). This is what actually reproduces
-- students_roll_unique's behaviour, which is a semantic parity, not a
-- textual one: `students` holds exactly ONE row per Student (their current
-- placement), so that index never had any history to constrain -- when a
-- Student was promoted or transferred out, their students.roll_number was
-- overwritten and the roll they vacated became free for the next admission.
-- student_enrollments, by contrast, RETAINS every closed placement, so an
-- index copied across without a closed_at filter would silently mean
-- something the old one never did: "no roll may ever be reused within this
-- Offering's entire history". That breaks the ordinary case of promoting a
-- class into an Offering that previously held students at rolls 1-40 (every
-- insert would 23505), and makes assign_enrollment_roll's max() climb
-- forever instead of resetting once an Offering empties out.
create or replace function public.assign_enrollment_roll() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  increment int;
begin
  if new.roll_number is null then
    -- Serialize concurrent admissions/transitions into the same Class
    -- Offering (released at commit) -- the direct analog of
    -- assign_student_roll's advisory lock, now keyed by a single uuid rather
    -- than a hashed text triple.
    perform pg_advisory_xact_lock(hashtextextended(new.class_offering_id::text, 0));
    select roll_number_increment into increment from schools where id = new.school_id;
    select coalesce(max(roll_number), 0) + coalesce(increment, 1) into new.roll_number
    from student_enrollments
    where class_offering_id = new.class_offering_id
      and closed_at is null;
  end if;
  return new;
end $$;

drop trigger if exists student_enrollment_assign_roll on public.student_enrollments;
create trigger student_enrollment_assign_roll
  before insert on public.student_enrollments
  for each row execute function public.assign_enrollment_roll();

create unique index student_enrollments_roll_unique
  on public.student_enrollments (class_offering_id, roll_number)
  where roll_number is not null and closed_at is null;

comment on index public.student_enrollments_roll_unique is
  'Backstops assign_enrollment_roll (issue #586, map #568/#582) -- the semantic port of students_roll_unique (0034/0120), constraining CURRENT placements only (closed_at is null). students held one row per Student so it had no history to constrain; student_enrollments keeps every closed placement, so constraining those too would forbid ever reusing a roll within an Offering -- which the old model always allowed once a Student moved out.';
