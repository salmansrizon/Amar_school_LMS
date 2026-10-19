-- 0250_absence_sms_streak_skips_weekly_off_days.sql
-- Issue #703 item 4.5.
-- DRAFT: written by an agent, applied by hand after review. One function
-- replaced, no data change, no policy change, no table change. Safe to run
-- twice. NEEDS THE OWNER'S YES: it changes which absence SMS rule matches.
--
-- WHAT
--   absence_sms_candidates(job_secret, target_date) walks back from the target
--   date to measure the absence streak. The walk skips off_days and approved
--   leave with its own inline conditions (0046). This adds the one condition
--   0218 gave is_absent_working_day: a day whose weekday is in the School's
--   schools.weekly_off_days is not a working day, so the walk steps over it.
--   Nothing else in the function is changed (secret check, 60-day limit,
--   rule match, returned columns).
--
-- WHY
--   After 0218 no SMS is raised ON a weekly off-day, but the walk still counts
--   the weekend inside a streak. The streak is too long, so the wrong rule
--   matches or a rule matches when none should.
--
-- THE RULE (identical to 0218, see that header)
--   0 = Sunday .. 6 = Saturday, the weekday of the calendar date, no time zone.
--   NULL weekly_off_days reads as {6}; an empty array skips nothing.
--
-- BEFORE / AFTER (School with weekly off-days Friday + Saturday = {5,6};
-- rules "exactly 2 days" and "3 to 4 days"; 0218 already applied; the Student
-- has no leave and no off_days rows in the week. Thu 1 Oct 2026, Fri 2, Sat 3,
-- Sun 4, Mon 5.)
--   A. Present Wed 30 Sep. Absent Thu 1 and Sun 4. Run for Sun 4.
--        before: streak 4 (Sun, Sat, Fri, Thu) -> "3 to 4 days" SMS
--        after:  streak 2 (Sun, Thu)           -> "exactly 2 days" SMS
--   B. Present Thu 1. Absent Sun 4 only. Run for Sun 4.
--        before: streak 3 (Sun, Sat, Fri)      -> "3 to 4 days" SMS
--        after:  streak 1                      -> no SMS (no rule for 1 day)
--   C. Present Thu 1. Absent Sun 4 and Mon 5. Run for Mon 5.
--        before: streak 4                      -> "3 to 4 days" SMS
--        after:  streak 2                      -> "exactly 2 days" SMS
--   D. Present Sun 4. Absent Mon 5 .. Wed 7. Run for Wed 7 (no weekend inside).
--        before: streak 3, after: streak 3     -> unchanged
--   E. School with weekly off-day Saturday only ({6}, the default). Present
--      Wed 30 Sep. Absent Thu 1, Fri 2, Sun 4. Run for Sun 4.
--        before: streak 4, after: streak 3     -> same "3 to 4 days" rule
--   F. A Student who has an attendance record ON a weekly off-day (an extra
--      class on Friday 2) and is absent Thu 1 and Sun 4. Run for Sun 4.
--        before: streak 3 (Sun, Sat, then Friday's record ends the walk)
--        after:  streak 2 (Friday is not a working day, so it is stepped over
--                and Thursday is reached). This is how an off_days row with a
--                record on it has always been treated by this walk.
--   A School whose weekly_off_days is '{}' sees no change at all.
--   In short: every streak that crosses a weekly off-day gets shorter by the
--   number of weekly off-days inside it; no streak gets longer except case F.
--
-- EFFECT ON EXISTING DATA
--   None stored. sms_log rows already sent stay. The next cron run
--   (app/api/sms/absence/route.ts, 13:00 UTC daily) uses the new streak.
--   record_absence_sms dedupes on (student, rule, day), which is unchanged.
--
-- PREREQUISITE
--   0206 (schools.weekly_off_days). Apply AFTER 0218: without 0218 the anchor
--   day itself can still be a weekly off-day (that is 0218's fix, not this
--   one). Nothing breaks in the other order; the result is only half fixed.
--
-- PRE-CHECK (read-only; run before, keep the output, run again after)
--   -- 1. The rules and weekly off-days per School:
--   select s.id, s.name, s.weekly_off_days, r.exact_days, r.range_from, r.range_to
--     from schools s join absence_sms_rules r on r.school_id = s.id order by s.name;
--   -- 2. Who would be texted for each of the last 7 days, and under which rule.
--   --    The function only reads (it is STABLE); it sends nothing.
--   select d::date as day, c.school_id, c.student_id, c.rule_id, c.streak
--     from generate_series(current_date - 6, current_date, interval '1 day') d
--    cross join lateral public.absence_sms_candidates(
--      (select value from vendor_secrets where key = 'reconcile'), d::date) c
--    order by 1, 2, 3;
--   After applying, the same query should differ only in rows whose streak
--   crossed a weekly off-day (lower streak, possibly another rule_id or gone).
--   -- 3. Privileges, to compare afterwards (0021: anon, authenticated; not public):
--   select has_function_privilege('anon', 'public.absence_sms_candidates(text, date)', 'execute');
--
-- ROLLBACK (run as written; restores the 0046 body)
--   create or replace function public.absence_sms_candidates(job_secret text, target_date date)
--   returns table (school_id uuid, student_id uuid, student_name text, guardian_phone text, rule_id uuid, streak int)
--   language plpgsql stable security definer set search_path = public as $$
--   begin
--     if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
--       raise exception 'invalid job secret';
--     end if;
--     return query
--     with recursive streaks as (
--       select s.school_id, s.id as sid, target_date as day, 1 as depth
--       from students s
--       where public.is_absent_working_day(s.id, s.school_id, target_date)
--       union all
--       select st.school_id, st.sid, prev.day, st.depth + 1
--       from streaks st
--       cross join lateral (
--         select d::date as day
--         from generate_series(st.day - 1, st.day - 60, interval '-1 day') g(d)
--         where not exists (select 1 from off_days o where o.school_id = st.school_id and o.day = g.d::date)
--           and not exists (
--             select 1 from student_leaves l
--             where l.student_id = st.sid and l.status = 'approved' and g.d::date between l.from_day and l.to_day
--           )
--         order by g.d desc
--         limit 1
--       ) prev
--       where st.depth < 60
--         and not exists (
--           select 1 from attendance_records ar
--           where ar.person_type = 'student' and ar.person_id = st.sid and ar.att_date = prev.day
--         )
--     ),
--     streak_len as (
--       select st.school_id, st.sid, max(st.depth) as streak
--       from streaks st
--       group by st.school_id, st.sid
--     )
--     select sl.school_id, sl.sid, s.full_name, s.guardian_phone, r.id, sl.streak
--     from streak_len sl
--     join students s on s.id = sl.sid
--     join absence_sms_rules r on r.school_id = sl.school_id
--     where (r.exact_days is not null and sl.streak = r.exact_days)
--        or (r.range_from is not null and sl.streak between r.range_from and r.range_to);
--   end $$;

-- Same signature, language, volatility, definer and search_path as 0046.
-- No grant or revoke: create or replace keeps the privileges set in 0021
-- (revoked from public, granted to anon and authenticated; the job secret is
-- the gate). The only new lines are the weekly off-day `not exists` below.
create or replace function public.absence_sms_candidates(job_secret text, target_date date)
returns table (
  school_id uuid,
  student_id uuid,
  student_name text,
  guardian_phone text,
  rule_id uuid,
  streak int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;

  return query
  with recursive streaks as (
    select s.school_id, s.id as sid, target_date as day, 1 as depth
    from students s
    where public.is_absent_working_day(s.id, s.school_id, target_date)
    union all
    select st.school_id, st.sid, prev.day, st.depth + 1
    from streaks st
    cross join lateral (
      select d::date as day
      from generate_series(st.day - 1, st.day - 60, interval '-1 day') g(d)
      where not exists (select 1 from off_days o where o.school_id = st.school_id and o.day = g.d::date)
        -- #703 item 4.5: the same clause as is_absent_working_day (0218).
        and not exists (
          select 1 from schools sc
          where sc.id = st.school_id
            and extract(dow from g.d::date)::int = any (coalesce(sc.weekly_off_days, '{6}'::smallint[]))
        )
        and not exists (
          select 1 from student_leaves l
          where l.student_id = st.sid and l.status = 'approved' and g.d::date between l.from_day and l.to_day
        )
      order by g.d desc
      limit 1
    ) prev
    where st.depth < 60
      and not exists (
        select 1 from attendance_records ar
        where ar.person_type = 'student' and ar.person_id = st.sid and ar.att_date = prev.day
      )
  ),
  streak_len as (
    select st.school_id, st.sid, max(st.depth) as streak
    from streaks st
    group by st.school_id, st.sid
  )
  select sl.school_id, sl.sid, s.full_name, s.guardian_phone, r.id, sl.streak
  from streak_len sl
  join students s on s.id = sl.sid
  join absence_sms_rules r on r.school_id = sl.school_id
  where (r.exact_days is not null and sl.streak = r.exact_days)
     or (r.range_from is not null and sl.streak between r.range_from and r.range_to);
end $$;

notify pgrst, 'reload schema';
