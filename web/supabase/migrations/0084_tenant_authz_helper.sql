-- 0084_tenant_authz_helper.sql
-- Review follow-up (map #258, after #261-#265). Two fixes, no behavior change:
--   1. Extract the "super-admin OR this tenant's member" predicate that was
--      re-inlined ~11x across the new definer RPCs into public.app_tenant_member()
--      (mirroring is_system_caller), and re-define the callers to compose it.
--   2. Add a recursion-depth guard to app_feature_enabled so a mistakenly cyclic
--      feature dependency can't stack-overflow.
-- Plus: add workflow_attach to complete the workflow attachments v1 surface.

create or replace function public.app_tenant_member(p_school_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select public.app_current_role() = 'super_admin'
    or (p_school_id is not null and p_school_id = public.app_current_school_id());
$$;

-- #261 record_audit: super/tenant/system authority via the helper.
create or replace function public.record_audit(
  p_entity_type text, p_entity_id text, p_action text,
  p_school_id uuid default null, p_actor_id uuid default null,
  p_before jsonb default null, p_after jsonb default null,
  p_ip text default null, p_request_id text default null,
  p_dedupe_key text default null, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  is_system boolean := public.is_system_caller(job_secret);
begin
  if not (public.app_tenant_member(p_school_id) or is_system) then
    raise exception 'not authorized to record audit for this tenant';
  end if;
  if not is_system and p_actor_id is not null and p_actor_id <> auth.uid() then
    raise exception 'cannot record audit on behalf of another actor';
  end if;
  insert into public.audit_log (
    actor_id, school_id, entity_type, entity_id, action,
    before, after, ip, request_id, dedupe_key
  ) values (
    coalesce(p_actor_id, auth.uid()), p_school_id, p_entity_type, p_entity_id, p_action,
    p_before, p_after, p_ip, p_request_id, p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into new_id;
  return new_id;
end;
$$;

-- #263 app_feature_enabled: helper + cycle guard (p_depth). Drop the old 2-arg
-- signature first — adding p_depth would otherwise create an overload and make
-- the PostgREST rpc('app_feature_enabled', {p_school, p_feature}) call ambiguous.
drop function if exists public.app_feature_enabled(uuid, text);
create or replace function public.app_feature_enabled(p_school uuid, p_feature text, p_depth integer default 0)
  returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  self_enabled boolean;
  st text; eff timestamptz; exp timestamptz;
  def text;
  dep text;
begin
  if not public.app_tenant_member(p_school) then
    raise exception 'not authorized to resolve features for this tenant';
  end if;
  if p_depth > 32 then
    raise exception 'feature dependency cycle detected for %', p_feature;
  end if;

  select state, effective_from, expires_at into st, eff, exp
    from public.school_features where school_id = p_school and feature_key = p_feature;
  if found then
    self_enabled := st in ('active', 'trial', 'premium')
      and (eff is null or eff <= now()) and (exp is null or exp > now());
  elsif exists (
    select 1 from public.school_plan spn
      join public.plan_features pf on pf.plan_key = spn.plan_key
    where spn.school_id = p_school and pf.feature_key = p_feature
  ) then
    self_enabled := true;
  elsif exists (select 1 from public.school_plan where school_id = p_school) then
    self_enabled := false;
  else
    select default_state into def from public.features where key = p_feature;
    self_enabled := coalesce(def in ('active', 'trial', 'premium'), false);
  end if;

  if not self_enabled then
    return false;
  end if;
  for dep in select depends_on_key from public.feature_dependencies where feature_key = p_feature loop
    if not public.app_feature_enabled(p_school, dep, p_depth + 1) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- #264 workflow authz via the helper.
create or replace function public.workflow_instance_visible(p_instance uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workflow_instances wi
    where wi.id = p_instance and public.app_tenant_member(wi.school_id)
  );
$$;

create or replace function public.workflow_start(
  p_definition_key text, p_school_id uuid, p_entity_type text, p_entity_id text,
  p_payload jsonb default '{}'::jsonb
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare first_seq integer; new_id uuid;
begin
  if not public.app_tenant_member(p_school_id) then
    raise exception 'not authorized to start a workflow for this tenant';
  end if;
  if not exists (select 1 from public.workflow_definitions where key = p_definition_key and active) then
    raise exception 'unknown or inactive workflow definition';
  end if;
  select min(seq) into first_seq from public.workflow_stages where definition_key = p_definition_key;
  if first_seq is null then raise exception 'workflow definition has no stages'; end if;

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

create or replace function public.workflow_decide(
  p_instance_id uuid, p_decision text, p_comment text default null
) returns text
  language plpgsql security definer set search_path = public as $$
declare
  inst public.workflow_instances; stg public.workflow_stages;
  next_seq integer; final_status text;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'decision must be approved or rejected'; end if;
  select * into inst from public.workflow_instances where id = p_instance_id for update;
  if not found then raise exception 'workflow instance not found'; end if;
  if inst.status <> 'in_progress' then raise exception 'workflow is not in progress'; end if;
  if not public.app_tenant_member(inst.school_id) then raise exception 'not authorized for this tenant'; end if;

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

-- Complete the workflow attachments v1 surface.
create or replace function public.workflow_attach(p_instance_id uuid, p_path text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.workflow_instance_visible(p_instance_id) then
    raise exception 'not authorized for this workflow';
  end if;
  insert into public.workflow_attachments (instance_id, uploaded_by, path)
  values (p_instance_id, auth.uid(), p_path) returning id into new_id;
  return new_id;
end;
$$;
