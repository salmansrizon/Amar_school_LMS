-- 0152_student_message_class_scope.sql
-- Map #434 / ticket #508: class attachment governs READING, not just acting.
--
-- 0148 and 0149 both shipped `school_id = app_current_school_id()` for select on
-- the two student-facing queues, with 0148's comment presenting it as deliberate
-- owner oversight. That was written before ADR 0017 gave a Staff User's reach a
-- second axis, and it no longer holds: an accounts clerk holding the `students`
-- grant could read every child's question and every correction request in the
-- school. ADR 0018 restates the rule and this migration enforces it.
--
--   Actor           | Questions          | Corrections | Replies / acts
--   ----------------+--------------------+-------------+--------------------
--   School Owner    | all                | all         | replies; sole applier
--   Class Teacher   | own classes        | own classes | replies, own classes
--   Subject Teacher | classes they teach | NONE        | replies only on their
--                   | + own anchor       |             | own anchor
--   Office staff    | nothing            | nothing     | nothing
--
-- The two queues are scoped differently on purpose. A question carries an
-- Anchor, so a Subject Teacher has something to earn his reach with; a
-- correction request is about the CHILD, has no anchor, and he could not act on
-- one anyway — so reading it would buy him nothing and cost the child's guardian
-- phone number, blood group, religion and home address. See ADR 0018.
--
-- Additive only — staging and main share one project.

-- ---------------------------------------------------------------------------
-- 1. The rule itself, as one definer scalar.
--
-- Returns *which* capacity the caller holds over this Student, not merely
-- whether they hold one, because the two policies below need different answers
-- from the same walk: reading takes any capacity, replying distinguishes a Class
-- Teacher from a Subject Teacher. One function rather than two booleans over the
-- same three-way join — the predicate IS the rule, and a rule that lives in four
-- policy expressions drifts in three of them.
--
--   'owner'           — School Owner of this Student's school
--   'class_teacher'   — classes.class_teacher_id points at the caller
--   'subject_teacher' — the caller appears in that Class's routine
--   null              — no reach at all (office staff, another school, a Student)
--
-- Class Teacher wins where someone is both: it is the stronger capacity, and the
-- reply policy asks this question expecting the strongest answer.
--
-- Deliberately NOT wrapped `(select …)` at the call site: it takes the row's own
-- student_id, so it is not constant across the scan and cannot be hoisted into
-- an InitPlan. 0150 §2 drew that line explicitly — wrapping an argument-taking
-- helper buys nothing and reads as though it did. The zero-argument helpers are
-- hoisted *inside* the body instead, evaluated once per call rather than once
-- per branch.
create or replace function public.staff_class_capacity_for_student(p_student uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    -- A Student reaches nobody: app_current_school_id() is null for
    -- role='student' (0131). Named here so a reader need not go and check.
    when public.app_current_school_id() is null then null
    when public.app_current_role() = 'school_owner' then (
      select 'owner' from students s
       where s.id = p_student and s.school_id = public.app_current_school_id()
    )
    -- Neither axis exists without an Employee record to attach to. Office staff,
    -- and any staff login not linked through employees.profile_id, land here.
    when public.app_current_employee_id() is null then null
    -- Aggregated across EVERY matching class row, not `limit 1` over an
    -- arbitrary one. `classes` carries no uniqueness on (school_id, name,
    -- section) — only classes_id_school_unique (id, school_id) from 0024 — and
    -- `students` joins to it by name and section rather than by id. So two rows
    -- with the same name and section are possible, and `limit 1` would let the
    -- planner decide whether a Class Teacher may read her own class. bool_or
    -- also puts ADR 0018's "the stronger capacity wins" in the code instead of
    -- leaving it incidental.
    else (
      select case
               when bool_or(c.class_teacher_id = public.app_current_employee_id())
                 then 'class_teacher'
               when bool_or(exists (
                      select 1 from routine_slots r
                       where r.class_id = c.id
                         and r.teacher_id = public.app_current_employee_id()
                    ))
                 then 'subject_teacher'
             end
        from students s
        join classes c
          on c.school_id = s.school_id
         and c.name = s.class_name
         and coalesce(c.section, '') = coalesce(s.section, '')
       where s.id = p_student
         and s.school_id = public.app_current_school_id()
    )
  end
$$;

comment on function public.staff_class_capacity_for_student(uuid) is
  'ADR 0018: which capacity the calling Staff User holds over this Student — owner / class_teacher / subject_teacher / null (no reach).';

-- ---------------------------------------------------------------------------
-- 2. "Do I reach any class at all?" — for the section's empty-scope line.
--
-- A Subject Teacher whose routine has not been entered yet resolves to no
-- classes, and #509 must tell them why rather than showing a blank section. The
-- page cannot work that out for itself: answering it means reading `classes` and
-- `routine_slots`, and ADR 0017 makes the attachment sufficient WITHOUT the
-- `classes` grant — so the very teacher this line is for is the one whose query
-- would come back empty for the wrong reason.
--
-- One scalar about the caller's own reach, the shape app_current_employee_id()
-- already set (0138). It answers only about the caller, so it enumerates nothing.
create or replace function public.staff_reaches_any_class()
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.app_current_school_id() is null then false
    when public.app_current_role() = 'school_owner' then true
    when public.app_current_employee_id() is null then false
    else exists (
      select 1 from classes c
       where c.school_id = public.app_current_school_id()
         and (
           c.class_teacher_id = public.app_current_employee_id()
           or exists (
             select 1 from routine_slots r
              where r.class_id = c.id
                and r.teacher_id = public.app_current_employee_id()
           )
         )
    )
  end
$$;

comment on function public.staff_reaches_any_class() is
  'ADR 0018: does the caller hold a class attachment anywhere in their school? Drives the empty-scope line on Messages & Requests (#509).';

-- ---------------------------------------------------------------------------
-- 3. "Is this question about work I set?" — the anchor.
--
-- The amendment ADR 0018 makes to 0017. A question must anchor to a publication
-- or a subject, so "why is question 4 due Thursday?" is a question about a
-- specific task — visible under 0017 to the Subject Teacher who set that task
-- and answerable only by the Class Teacher, who then has to go and ask them.
-- The relay is the defect. The anchor authorises the reply.
--
-- A Subject Teacher still decides nothing *about the child*: no leave, no
-- correction, no profile. They decide about the work they set.
create or replace function public.staff_owns_message_anchor(p_message uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from student_messages m
     where m.id = p_message
       and m.school_id = public.app_current_school_id()
       and (
         -- A post they published — but only if they teach somewhere.
         --
         -- `publications.created_by` is a profiles.id, a LOGIN, so authorship on
         -- its own says nothing about class attachment: an office clerk holding
         -- the `notices` grant can publish a school-wide notice. Without this
         -- guard, doing so would hand them every question asked about it, across
         -- every class — and #508 is explicit that office staff read "nothing
         -- student-facing". Authorship is a form of attachment only for someone
         -- who already has one; for everyone else the question falls to the
         -- Class Teacher and the Owner, as it did before ADR 0018.
         (
           public.staff_reaches_any_class()
           and exists (
             select 1 from publications p
              where p.id = m.publication_id
                and p.created_by = auth.uid()
           )
         )
         -- A subject they teach anywhere in this school. A null teacher_id and a
         -- null app_current_employee_id() both fail the equality, so an office
         -- staff login matches nothing here.
         or exists (
           select 1 from routine_slots r
            where r.subject_id = m.subject_id
              and r.school_id = m.school_id
              and r.teacher_id = public.app_current_employee_id()
         )
       )
  )
$$;

comment on function public.staff_owns_message_anchor(uuid) is
  'ADR 0018: is this question anchored to work the caller set — their own subject in the routine, or a post they published?';

-- ---------------------------------------------------------------------------
-- 4. The school-wide Σ a teacher is allowed to see.
--
-- #509 gives a teacher her own response row "plus the school-wide Σ aggregate —
-- enough to know 'I'm at 14h, the school is at 9h' without publishing a league
-- table to the people on it". Section 6 below makes that impossible to compute
-- on the client: her SELECT is scoped to her own classes, so her Σ would be her
-- own total wearing the school's label, which is worse than no Σ at all.
--
-- Resolved by disclosure rather than by widening the policy: an AGGREGATE over
-- rows you may not read is a different thing from reading them. This returns two
-- timestamps per question and nothing else — no student, no class, no subject,
-- no body. You cannot learn who asked anything, only how long the school takes.
--
-- Timestamps rather than a computed median so the arithmetic stays in
-- lib/student/response-performance.ts, where it is already unit-tested and where
-- the Owner's identical figures come from. One definition of "median", not two.
create or replace function public.school_question_timings(
  p_from date default null,
  p_to   date default null
) returns table (created_at timestamptz, replied_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.created_at, m.replied_at
    from student_messages m
   -- Attachment, not merely school membership. Without this the aggregate is
   -- open to any authenticated staff login — including the office staff who read
   -- nothing student-facing — and the only thing keeping it off their screen is
   -- the page's render condition. README.md: RLS is the authority, "never as the
   -- only gate".
   where public.staff_reaches_any_class()
     and m.school_id = public.app_current_school_id()
     and (p_from is null or m.created_at >= p_from::timestamptz)
     -- Inclusive of the end date, matching withinRange()'s date-only comparison.
     and (p_to is null or m.created_at < (p_to + 1)::timestamptz)
   limit 5000
$$;

comment on function public.school_question_timings(date, date) is
  'ADR 0018 / #509: question timings school-wide, timestamps only. Lets a teacher see the school-wide response aggregate without seeing a single question outside her own classes.';

-- ---------------------------------------------------------------------------
-- 5. "May I answer this one?" — the reply rule, once.
--
-- The reply predicate is NOT the read predicate. A Subject Teacher who can see a
-- class's questions is still refused on one anchored to a colleague's subject —
-- that refusal is the whole point of the anchor rule.
--
-- It lives here rather than inside the UPDATE policy because two things need the
-- same answer: the policy, per row, when a reply is written; and the inbox, in
-- bulk, so it can stop offering a reply box that would be refused. Writing it
-- twice and pinning the copies with a test would be testing around a duplication
-- instead of removing it.
create or replace function public.staff_may_answer_message(p_message uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from student_messages m
     where m.id = p_message
       and m.school_id = public.app_current_school_id()
       and (
         public.staff_class_capacity_for_student(m.student_id) in ('owner', 'class_teacher')
         or public.staff_owns_message_anchor(m.id)
       )
  )
$$;

comment on function public.staff_may_answer_message(uuid) is
  'ADR 0018: may the caller reply to this question? Owner or Class Teacher of the asking Student, or the teacher whose subject or publication it is anchored to.';

-- The same rule in bulk, so the inbox can hide a box the policy would refuse.
--
-- A set rather than the obvious shape — a boolean column on
-- student_message_inbox — which would be one SECURITY DEFINER call per row on a
-- view already capped at 500. And NOT the other direction either: a policy
-- written as `id in (select answerable_message_ids())` would make a single-row
-- reply scan every message in the school. The policy stays per-row; this scans
-- once per page load.
create or replace function public.answerable_message_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.id
    from student_messages m
   where m.school_id = public.app_current_school_id()
     and public.staff_may_answer_message(m.id)
$$;

comment on function public.answerable_message_ids() is
  'ADR 0018 / #509: the questions the caller may reply to. Lets the inbox hide a reply box the reply policy would refuse. The policy remains the decider.';

-- 0150 §1: CREATE FUNCTION grants EXECUTE to PUBLIC, so `revoke … from anon`
-- alone revokes a grant that was never there. Revoke from PUBLIC.
revoke execute on function public.staff_class_capacity_for_student(uuid) from public;
revoke execute on function public.staff_owns_message_anchor(uuid) from public;
revoke execute on function public.staff_reaches_any_class() from public;
revoke execute on function public.school_question_timings(date, date) from public;
revoke execute on function public.staff_may_answer_message(uuid) from public;
revoke execute on function public.answerable_message_ids() from public;
grant execute on function public.staff_class_capacity_for_student(uuid) to authenticated;
grant execute on function public.staff_class_capacity_for_student(uuid) to service_role;
grant execute on function public.staff_owns_message_anchor(uuid) to authenticated;
grant execute on function public.staff_owns_message_anchor(uuid) to service_role;
grant execute on function public.staff_reaches_any_class() to authenticated;
grant execute on function public.staff_reaches_any_class() to service_role;
grant execute on function public.school_question_timings(date, date) to authenticated;
grant execute on function public.school_question_timings(date, date) to service_role;
grant execute on function public.staff_may_answer_message(uuid) to authenticated;
grant execute on function public.staff_may_answer_message(uuid) to service_role;
grant execute on function public.answerable_message_ids() to authenticated;
grant execute on function public.answerable_message_ids() to service_role;

-- ---------------------------------------------------------------------------
-- 6. Questions: read by class attachment, reply by capacity OR anchor.
--
-- 0148's comment said "staff read and answer every question in their school",
-- and that is what the policy did. Replaced here rather than left contradicting
-- the policy beneath it.
drop policy if exists "school members read messages" on public.student_messages;
create policy "attached staff read messages" on public.student_messages
  for select using (
    school_id = (select public.app_current_school_id())
    and (
      public.staff_class_capacity_for_student(student_id) is not null
      -- A post published for one class can be read by a student in another when
      -- it targets 'all'. Its author must be able to see the question about it,
      -- or the reply grant below would point at a row they cannot fetch.
      or public.staff_owns_message_anchor(id)
    )
  );

-- Replying: section 5's predicate, per row. The rule has one home; this is one
-- of its two callers.
drop policy if exists "school members answer messages" on public.student_messages;
create policy "attached staff answer messages" on public.student_messages
  for update using (
    school_id = (select public.app_current_school_id())
    and public.staff_may_answer_message(id)
  ) with check (school_id = (select public.app_current_school_id()));

-- ---------------------------------------------------------------------------
-- 7. Corrections: read by class attachment. Applying is unchanged.
--
-- `owner resolves change requests` and apply_profile_change_request both stay
-- exactly as 0149 wrote them — the Owner remains the sole applier, because
-- applying writes the school's own record of enrolment. What changes here is
-- who may read the queue.
--
-- Owner and Class Teacher only — narrower than the questions queue above, and
-- deliberately so. There is no anchor here: a correction request is about the
-- CHILD, not about anybody's coursework, so a Subject Teacher has nothing to
-- earn his reach with. He also cannot act on one, so the reach would buy him
-- nothing and cost the child's guardian phone number, blood group, religion and
-- home address. This map set a stricter bar than that for the child's own
-- profile — 0131's student_self hides guardian_nid and sibling_info behind a
-- definer view "so they are absent rather than merely unselected".
--
-- A Subject Teacher therefore opens an empty Corrections tab; #509's badge
-- hides at zero and the empty-scope line explains it.
drop policy if exists "school members read change requests" on public.student_profile_change_requests;
create policy "attached staff read change requests" on public.student_profile_change_requests
  for select using (
    school_id = (select public.app_current_school_id())
    and public.staff_class_capacity_for_student(student_id) in ('owner', 'class_teacher')
  );

-- ---------------------------------------------------------------------------
-- 8. The storage mismatch, recorded where a reader will hit it.
--
-- CONTEXT.md calls this a Student Question; the table is `student_messages`.
-- That is deliberate: renaming a live table with a view, four policies, a
-- trigger and two definer functions attached is not worth the tidiness. The
-- comment is here so a search for "question" lands on the first try.
comment on table public.student_messages is
  'Student Question (CONTEXT.md). One question, one reply, always anchored to a publication or a subject. Named student_messages for historical reasons — the domain term is Question; see ADR 0018.';

comment on table public.student_profile_change_requests is
  'Profile Correction Request (CONTEXT.md). A Student requests, the School Owner applies via apply_profile_change_request. Read scope is class attachment (ADR 0018).';
