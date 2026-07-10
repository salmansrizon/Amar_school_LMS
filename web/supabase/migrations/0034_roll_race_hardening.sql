-- Review hardening (issue #27 greploop): assign_student_roll computed
-- max()+1 non-atomically, so two concurrent admissions into the same class
-- could get the same roll. A transaction-scoped advisory lock serializes the
-- computation per School+class, and a partial unique index backstops it so
-- any residual collision (e.g. an explicit duplicate roll) is visible rather
-- than silent. Additive only.

create or replace function public.assign_student_roll() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.roll_number is null and new.class_name is not null then
    -- Serialize concurrent admissions to the same School+class (released at
    -- commit); hashtextextended keeps the lock key inside bigint space.
    perform pg_advisory_xact_lock(
      hashtextextended(new.school_id::text || ':' || new.class_name, 0)
    );
    select coalesce(max(roll_number), 0) + 1 into new.roll_number
    from students
    where school_id = new.school_id and class_name = new.class_name;
  end if;
  return new;
end $$;

create unique index students_roll_unique
  on public.students (school_id, class_name, roll_number)
  where roll_number is not null and class_name is not null;
