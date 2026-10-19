-- 0243_approvals_scoped_to_reach.sql
-- Issue #689 (Approvals inbox and dashboard count are school-wide for any
-- member). Index item 1.4.
-- WRITTEN, NOT APPLIED. The app works with and without it: the Approvals page
-- and the dashboard count already apply the same rule in TypeScript
-- (web/lib/school/approvals-reach.ts); this makes the database agree.
--
-- WHAT
--   A school member reads a workflow instance (and its steps, comments and
--   attachments) only when it is in their reach:
--     a. the School Owner: every instance of their School (unchanged);
--     b. an approver of the instance's CURRENT stage - workflow_stages names
--        their role or their user id (the same test workflow_decide applies);
--     c. the person who started it;
--     d. someone who already decided an earlier stage of it;
--     e. office staff (a Staff User with no employees row) holding the
--        Attendance grant, for the two attendance workflows
--        (leave_approval, attendance_correction).
--   Today the rule is only "same School".
--
-- WHY
--   `approvals` is a `member` screen (ADR 0020), so every Staff User can open
--   it, and "members read own instances" (0082) gives them the whole School's
--   queue: a login with no Permission Grant saw 343 pending items and their
--   count on the dashboard. None of them could decide any of it - every seeded
--   stage names school_owner.
--
-- DECISION TAKEN (open in the issue; the owner can reverse it)
--   "Show only what the viewer can act on or is party to", plus (e) so that
--   office staff who run Attendance keep the leave queue they see today. What
--   (e) shows them is nothing new: employee_leaves and student_leaves are
--   already readable with that grant (0136). A workflow definition added later
--   is NOT in (e) until someone adds it here: unknown means Owner, approvers
--   and parties only.
--
-- EFFECT ON EXISTING DATA
--   None. One function added, one function redefined, one policy replaced.
--
-- EFFECT PER ROLE
--   School Owner ............ no change: every instance of their School.
--   Office staff + Attendance  no change for leave_approval and
--                             attendance_correction instances. Loses sight of
--                             any other definition's instances unless (b)-(d).
--   Office staff, no Attendance grant
--                             LOSES the school-wide list and count (this is
--                             the leak in the issue). Keeps (b)-(d).
--   Class teacher / subject teacher
--                             LOSES the school-wide list and count. Keeps (b)-(d).
--   Student ................. no change (never a school member here, 0131).
--   anon .................... no change (no access).
--   Super Admin ............. no change ("super admin reads instances" untouched).
--   Nobody loses the ability to DECIDE: workflow_decide is SECURITY DEFINER
--   and reads the instance by id, not through this policy.
--
-- WHO RELIES ON THE OLD ACCESS, AND WHY THEY STILL WORK
--   web/app/school/approvals/page.tsx     lists in_progress instances: now the
--                                         caller's reach; the Owner's list is unchanged.
--   web/app/school/page.tsx               the pending-approvals count: same.
--   web/lib/engines/workflow/engine.ts    status(id): the caller is the initiator (c)
--                                         or the Owner (a) wherever it is used
--                                         (web/lib/school/leave-approval.ts, tests).
--   workflow_instance_visible(uuid)       guards the read policies on workflow_steps,
--                                         workflow_comments, workflow_attachments and
--                                         the RPCs workflow_comment / workflow_attach
--                                         (0084). Redefined below to the same reach, so
--                                         who can read an instance = who can read and
--                                         add its comments.
--   workflow_start, workflow_decide, workflow_leave_sync (0084, 0105)
--                                         SECURITY DEFINER, read by id: unaffected.
--   web/app/super-admin/workflows/*       Super Admin policy: unaffected.
--   web/lib/partner/index.ts              distributor onboarding, school_id null:
--                                         never matched the member policy: unaffected.
--   Integration tests: workflow-engine.test.ts and leave-workflow.test.ts act as
--   the Owner (a) and assert another School's Owner sees nothing (still true).
--
-- PRE-CHECK (read-only; run before applying, keep the output)
--   -- 1. The policy and function being replaced are the ones from 0082/0084.
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'workflow_instances' order by policyname;
--   select pg_get_functiondef('public.workflow_instance_visible(uuid)'::regprocedure);
--
--   -- 2. Which stages name someone other than the Owner. Every row here is a
--   --    role or user that KEEPS its instances through rule (b).
--   select definition_key, seq, approver_role, approver_user from public.workflow_stages
--    where approver_role is distinct from 'school_owner' or approver_user is not null
--    order by 1, 2;
--
--   -- 3. Definitions with school instances. Anything besides leave_approval and
--   --    attendance_correction is NOT covered by rule (e): decide whether office
--   --    staff should see it before applying.
--   select definition_key, status, count(*) from public.workflow_instances
--    where school_id is not null group by 1, 2 order by 1, 2;
--
--   -- 4. Instances started by someone who is not the Owner (they keep theirs, rule c).
--   select p.role, count(*) from public.workflow_instances wi
--     join public.profiles p on p.id = wi.initiator_id
--    where wi.school_id is not null group by 1;
--
-- ROLLBACK (exact, in this order; restores 0082/0084)
--   drop policy if exists "members read instances in reach" on public.workflow_instances;
--   create policy "members read own instances" on public.workflow_instances
--     for select using (school_id is not null and school_id = public.app_current_school_id());
--   create or replace function public.workflow_instance_visible(p_instance uuid)
--     returns boolean language sql stable security definer set search_path = public as $$
--     select exists (
--       select 1 from public.workflow_instances wi
--       where wi.id = p_instance and public.app_tenant_member(wi.school_id)
--     );
--   $$;
--   drop function if exists public.workflow_instance_in_reach(uuid, uuid, text, integer, uuid);
--   notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 1. The rule, once. Takes the row's own columns so the policy does not read
--    workflow_instances a second time.
create or replace function public.workflow_instance_in_reach(
  p_instance uuid,
  p_school uuid,
  p_definition text,
  p_seq integer,
  p_initiator uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school is not null
     and p_school = public.app_current_school_id()
     and (
       -- a. the Owner
       public.app_current_role() = 'school_owner'
       -- c. started it
       or p_initiator = auth.uid()
       -- b. approver of the current stage (workflow_decide's own test)
       or exists (
         select 1 from workflow_stages s
          where s.definition_key = p_definition and s.seq = p_seq
            and ((s.approver_role is not null and s.approver_role = public.app_current_role())
              or (s.approver_user is not null and s.approver_user = auth.uid()))
       )
       -- d. decided an earlier stage
       or exists (
         select 1 from workflow_steps st
          where st.instance_id = p_instance and st.approver_id = auth.uid()
       )
       -- e. office staff who run Attendance, for the attendance workflows
       or (
         p_definition in ('leave_approval', 'attendance_correction')
         and public.app_current_role() = 'staff_user'
         and public.app_current_employee_id() is null
         and public.app_module_granted('attendance')
       )
     )
$$;

comment on function public.workflow_instance_in_reach(uuid, uuid, text, integer, uuid) is
  'May the calling school member read this workflow instance? Owner; current-stage approver; initiator; earlier decider; office staff with the Attendance grant for the attendance workflows. Issue #689.';

-- A policy helper: it is evaluated with the privileges of the role making the
-- request, so it keeps the default EXECUTE (0150 explains why revoking PUBLIC
-- on a policy helper turns "no rows" into "permission denied for function").
-- It answers false for anon and for a Student: app_current_school_id() is null.

-- ---------------------------------------------------------------------------
-- 2. The instance policy.
drop policy if exists "members read own instances" on public.workflow_instances;
drop policy if exists "members read instances in reach" on public.workflow_instances;
create policy "members read instances in reach" on public.workflow_instances
  for select using (
    public.workflow_instance_in_reach(id, school_id, definition_key, current_seq, initiator_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Steps, comments and attachments follow the instance, as before.
create or replace function public.workflow_instance_visible(p_instance uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workflow_instances wi
    where wi.id = p_instance
      and (public.app_current_role() = 'super_admin'
        or public.workflow_instance_in_reach(wi.id, wi.school_id, wi.definition_key, wi.current_seq, wi.initiator_id))
  );
$$;

notify pgrst, 'reload schema';
