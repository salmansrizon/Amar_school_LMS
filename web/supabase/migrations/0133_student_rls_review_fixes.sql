-- 0133_student_rls_review_fixes.sql
-- Code-review pass on #441/#442 (map #434). Three real findings, all security.

-- ---------------------------------------------------------------------------
-- 1. The SECOND leak family.
--
-- 0131 closed `school_id = app_current_school_id()`. It did not close the other
-- shape this database uses for global config: `for select using (auth.uid() is
-- not null)`. A Student is authenticated, so on 23 tables — including
-- commission_rules, discounts, subscription_pricing, sms_rate_config, tax_config
-- and gl_accounts — every student in the country could read the vendor's money
-- configuration.
--
-- Same treatment as 0131: narrow at the seam, not per table. The rewrite is
-- driven off pg_policies rather than a hand-typed list, so it catches every
-- policy of this exact shape and stays correct if one is added before replay.
create or replace function public.app_is_student() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'student' from profiles where id = auth.uid()), false)
$$;

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public' and cmd = 'SELECT' and qual = '(auth.uid() IS NOT NULL)'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() is not null and not public.app_is_student())',
      r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Student policies stop going through a view.
--
-- 0131's policies selected from student_self. That works, but it makes every
-- student policy depend on a view grant: an anonymous read of `schools` or
-- `classes` evaluates the policy body and can fail with "permission denied for
-- view student_self" instead of simply returning nothing. Two definer scalars
-- have no such coupling — and student_in_class() is the predicate that every
-- later ticket on this map (routine, notices, attendance, results, seat plan)
-- would otherwise re-spell as the same three-way class/section/school match.
create or replace function public.app_current_student_school_id() returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from students where profile_id = auth.uid() and archived_at is null
$$;

create or replace function public.student_in_class(p_school uuid, p_class text, p_section text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students me
     where me.profile_id = auth.uid()
       and me.archived_at is null
       and me.school_id = p_school
       and me.class_name = p_class
       and coalesce(me.section, '') = coalesce(p_section, '')
  )
$$;

drop policy if exists "student reads own school" on public.schools;
create policy "student reads own school" on public.schools
  for select using (id = public.app_current_student_school_id());

drop policy if exists "student reads own class" on public.classes;
create policy "student reads own class" on public.classes
  for select using (public.student_in_class(school_id, name, section));

-- ---------------------------------------------------------------------------
-- 3. security_barrier on the definer views.
--
-- Both are granted to `authenticated` and both filter rows *after* selecting
-- from a table the caller cannot otherwise read. Without the barrier, a
-- non-leakproof qualifier supplied by the caller can be pushed below that row
-- filter and observe rows it should never see.
alter view public.student_self set (security_barrier = true);
alter view public.student_login_info set (security_barrier = true);

-- ---------------------------------------------------------------------------
-- 4. Student Number uniqueness follows the login address, which is lowercased.
--
-- `A01` and `a01` both derive to a01@<school>.students.invalid, so a
-- case-sensitive unique index would let a school create two Student Numbers
-- that collide on exactly the thing the number exists to produce.
drop index if exists public.students_student_no_unique;
create unique index if not exists students_student_no_unique
  on public.students (school_id, lower(student_no)) where student_no is not null;
