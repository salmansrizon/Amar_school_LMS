-- 0082_workflow_engine.sql
-- Workflow Engine (map #258, ticket #264). Generic, configurable approval
-- workflows: single-level and multi-level SEQUENTIAL stages, approver by role or
-- specific user, comments + attachments, full step history. State changes and
-- domain-event enqueue happen in the same transaction (transactional outbox via
-- publish_domain_event), so #261 Audit / #267 Notification react downstream.
--
-- Scope note: this lands the reusable engine + seeded definitions. Rewiring the
-- existing leave / attendance-correction flows onto it is deferred — their
-- approved-status is read directly by attendance-correctness SQL (0046
-- is_absent_working_day), so that cutover needs characterization + review and is
-- a separate ticket. Nothing routes through the engine yet, so no behavior change.

create table public.workflow_definitions (
  key text primary key,
  label jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

create table public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  definition_key text not null references public.workflow_definitions (key) on delete cascade,
  seq integer not null,
  name jsonb not null default '{}'::jsonb,
  -- Approver is a role, a specific user, or both (either satisfies).
  approver_role public.app_role,
  approver_user uuid,
  unique (definition_key, seq),
  constraint workflow_stage_has_approver check (approver_role is not null or approver_user is not null)
);

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  definition_key text not null references public.workflow_definitions (key),
  school_id uuid references public.schools (id) on delete cascade,
  initiator_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'approved', 'rejected', 'cancelled')),
  current_seq integer not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workflow_instances_school_idx on public.workflow_instances (school_id, status);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.workflow_instances (id) on delete cascade,
  seq integer not null,
  approver_id uuid not null,
  decision text not null check (decision in ('approved', 'rejected')),
  comment text,
  decided_at timestamptz not null default now()
);
create index workflow_steps_instance_idx on public.workflow_steps (instance_id);

create table public.workflow_comments (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.workflow_instances (id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.workflow_attachments (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.workflow_instances (id) on delete cascade,
  uploaded_by uuid not null,
  path text not null,
  created_at timestamptz not null default now()
);

alter table public.workflow_definitions enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_comments enable row level security;
alter table public.workflow_attachments enable row level security;

-- Definitions/stages: authenticated read, super-admin manages.
do $$
declare t text;
begin
  foreach t in array array['workflow_definitions', 'workflow_stages'] loop
    execute format('create policy "authenticated reads %1$s" on public.%1$s for select using (auth.uid() is not null)', t);
    execute format('create policy "super admin manages %1$s" on public.%1$s for all using (public.app_current_role() = ''super_admin'')', t);
  end loop;
end $$;

-- Instance visibility: super-admin all; school members read their tenant's.
create policy "super admin reads instances" on public.workflow_instances
  for select using (public.app_current_role() = 'super_admin');
create policy "members read own instances" on public.workflow_instances
  for select using (school_id is not null and school_id = public.app_current_school_id());

-- Child rows follow their instance's tenant scope (writes go through RPCs).
create or replace function public.workflow_instance_visible(p_instance uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workflow_instances wi
    where wi.id = p_instance
      and (public.app_current_role() = 'super_admin'
        or (wi.school_id is not null and wi.school_id = public.app_current_school_id()))
  );
$$;
do $$
declare t text;
begin
  foreach t in array array['workflow_steps', 'workflow_comments', 'workflow_attachments'] loop
    execute format('create policy "read visible %1$s" on public.%1$s for select using (public.workflow_instance_visible(instance_id))', t);
    execute format('create policy "super admin manages %1$s" on public.%1$s for all using (public.app_current_role() = ''super_admin'')', t);
  end loop;
end $$;

-- Seed definitions (config only; nothing routes through them yet).
insert into public.workflow_definitions (key, label) values
  ('leave_approval',         '{"bn":"ছুটি অনুমোদন","en":"Leave Approval"}'),
  ('attendance_correction',  '{"bn":"উপস্থিতি সংশোধন","en":"Attendance Correction"}'),
  ('distributor_onboarding', '{"bn":"ডিস্ট্রিবিউটর অনবোর্ডিং","en":"Distributor Onboarding"}');
insert into public.workflow_stages (definition_key, seq, name, approver_role) values
  ('leave_approval', 1, '{"bn":"মালিক অনুমোদন","en":"Owner Approval"}', 'school_owner'),
  ('attendance_correction', 1, '{"bn":"মালিক অনুমোদন","en":"Owner Approval"}', 'school_owner'),
  ('distributor_onboarding', 1, '{"bn":"সুপার অ্যাডমিন অনুমোদন","en":"Super Admin Approval"}', 'super_admin');

-- Start a workflow instance. Authorized for super-admin or the tenant's member.
create or replace function public.workflow_start(
  p_definition_key text,
  p_school_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb default '{}'::jsonb
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  first_seq integer;
  new_id uuid;
begin
  if not (public.app_current_role() = 'super_admin'
    or (p_school_id is not null and p_school_id = public.app_current_school_id())) then
    raise exception 'not authorized to start a workflow for this tenant';
  end if;
  if not exists (select 1 from public.workflow_definitions where key = p_definition_key and active) then
    raise exception 'unknown or inactive workflow definition';
  end if;
  select min(seq) into first_seq from public.workflow_stages where definition_key = p_definition_key;
  if first_seq is null then
    raise exception 'workflow definition has no stages';
  end if;

  insert into public.workflow_instances (definition_key, school_id, initiator_id, entity_type, entity_id, current_seq, payload)
  values (p_definition_key, p_school_id, auth.uid(), p_entity_type, p_entity_id, first_seq, coalesce(p_payload, '{}'::jsonb))
  returning id into new_id;

  perform public.publish_domain_event('WorkflowStarted', p_school_id,
    jsonb_build_object('instanceId', new_id, 'definition', p_definition_key), null, null);
  perform public.publish_domain_event('ApprovalRequested', p_school_id,
    jsonb_build_object('instanceId', new_id, 'seq', first_seq), null, null);
  return new_id;
end;
$$;

-- Approve or reject the current stage. Enforces the stage's approver (role or
-- user) + tenant. Advances sequentially or completes; enqueues events; audits.
create or replace function public.workflow_decide(
  p_instance_id uuid,
  p_decision text,
  p_comment text default null
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  inst public.workflow_instances;
  stg public.workflow_stages;
  next_seq integer;
  final_status text;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;
  select * into inst from public.workflow_instances where id = p_instance_id for update;
  if not found then raise exception 'workflow instance not found'; end if;
  if inst.status <> 'in_progress' then raise exception 'workflow is not in progress'; end if;

  if not (public.app_current_role() = 'super_admin'
    or (inst.school_id is not null and inst.school_id = public.app_current_school_id())) then
    raise exception 'not authorized for this tenant';
  end if;

  select * into stg from public.workflow_stages
    where definition_key = inst.definition_key and seq = inst.current_seq;
  if not ((stg.approver_role is not null and public.app_current_role() = stg.approver_role)
       or (stg.approver_user is not null and stg.approver_user = auth.uid())) then
    raise exception 'caller is not an approver for the current stage';
  end if;

  insert into public.workflow_steps (instance_id, seq, approver_id, decision, comment)
  values (p_instance_id, inst.current_seq, auth.uid(), p_decision, p_comment);

  if p_decision = 'rejected' then
    update public.workflow_instances set status = 'rejected', updated_at = now() where id = p_instance_id;
    final_status := 'rejected';
    perform public.publish_domain_event('ApprovalRejected', inst.school_id,
      jsonb_build_object('instanceId', p_instance_id, 'seq', inst.current_seq), null, null);
    perform public.publish_domain_event('WorkflowCompleted', inst.school_id,
      jsonb_build_object('instanceId', p_instance_id, 'status', 'rejected'), null, null);
  else
    perform public.publish_domain_event('ApprovalGranted', inst.school_id,
      jsonb_build_object('instanceId', p_instance_id, 'seq', inst.current_seq), null, null);
    select min(seq) into next_seq from public.workflow_stages
      where definition_key = inst.definition_key and seq > inst.current_seq;
    if next_seq is null then
      update public.workflow_instances set status = 'approved', updated_at = now() where id = p_instance_id;
      final_status := 'approved';
      perform public.publish_domain_event('WorkflowCompleted', inst.school_id,
        jsonb_build_object('instanceId', p_instance_id, 'status', 'approved'), null, null);
    else
      update public.workflow_instances set current_seq = next_seq, updated_at = now() where id = p_instance_id;
      final_status := 'in_progress';
      perform public.publish_domain_event('ApprovalRequested', inst.school_id,
        jsonb_build_object('instanceId', p_instance_id, 'seq', next_seq), null, null);
    end if;
  end if;

  perform public.record_audit('workflow_instance', p_instance_id::text,
    case when p_decision = 'approved' then 'approve' else 'reject' end,
    inst.school_id, null, jsonb_build_object('seq', inst.current_seq),
    jsonb_build_object('status', final_status), null, null, null, null);
  return final_status;
end;
$$;

-- Add a comment to an instance (visible-tenant members).
create or replace function public.workflow_comment(p_instance_id uuid, p_body text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.workflow_instance_visible(p_instance_id) then
    raise exception 'not authorized for this workflow';
  end if;
  insert into public.workflow_comments (instance_id, author_id, body)
  values (p_instance_id, auth.uid(), p_body) returning id into new_id;
  return new_id;
end;
$$;
