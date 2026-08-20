-- 0115_record_audit_super_admin_actor.sql
-- Closes a gap 0103 left open: record_audit's actor-attribution check only
-- exempted true system callers (job_secret) and self-attribution, not a
-- super_admin acting on behalf of another actor at the platform level. But
-- accept_agreement (0101) explicitly documents "Only the distributor
-- themselves, or a super/system caller acting for them" as a supported path
-- (its own outer authorization check, is_super_or_system, already allows
-- it) — the audit call inside it was never updated to match, so recording a
-- distributor's acceptance from the super-admin side always failed with
-- "cannot record audit on behalf of another actor" the moment it tried to
-- write the audit entry, for every caller, not just this feature.
--
-- app_tenant_member already treats super_admin as authorized for any
-- p_school_id (0084) — this brings the actor-attribution check in line with
-- that same "super_admin can act platform-wide" rule the rest of this
-- function (and the whole schema's RLS) already follows, scoped to
-- platform-level entries (p_school_id is null) so it can't be used to
-- impersonate audit entries for a specific school's tenant activity.
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
  is_platform_super boolean := p_school_id is null and public.app_current_role() = 'super_admin';
begin
  if not (
    public.app_tenant_member(p_school_id) or is_system
    or (p_school_id is null and p_actor_id = auth.uid())
  ) then
    raise exception 'not authorized to record audit for this tenant';
  end if;
  if not is_system and not is_platform_super and p_actor_id is not null and p_actor_id <> auth.uid() then
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
