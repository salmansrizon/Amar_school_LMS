-- 0103_record_audit_self_platform.sql
-- Allow a caller to record a platform-level (school_id null) audit entry
-- attributed to ITSELF (e.g. a distributor accepting an agreement). Still cannot
-- attribute to another actor. Fixes accept_agreement (0101) auditing.
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
  if not (
    public.app_tenant_member(p_school_id) or is_system
    or (p_school_id is null and p_actor_id = auth.uid())
  ) then
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
