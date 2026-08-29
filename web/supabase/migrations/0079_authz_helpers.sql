-- 0079_authz_helpers.sql
-- Architecture checkpoint (map #258, post #261). The "is this a trusted system
-- caller carrying the reconcile secret?" check was copy-pasted across five
-- SECURITY DEFINER functions in 0077/0078. Extract it into one helper and
-- re-define those functions to use it — behavior-identical, just DRY, before the
-- Policy Engine (#262) adds more authorization surface. No schema change.

create or replace function public.is_system_caller(job_secret text)
  returns boolean language sql stable security definer set search_path = public as $$
  select job_secret is not null
    and exists (select 1 from public.vendor_secrets where key = 'reconcile' and value = job_secret);
$$;

-- 0077: event outbox authorization + RPCs, now via is_system_caller.
create or replace function public.event_publish_authorized(p_school_id uuid, job_secret text)
  returns boolean language sql stable security definer set search_path = public as $$
  select
    public.app_current_role() = 'super_admin'
    or (p_school_id is not null and p_school_id = public.app_current_school_id())
    or public.is_system_caller(job_secret);
$$;

create or replace function public.publish_domain_event(
  p_type text,
  p_school_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_actor_id uuid default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  is_system boolean := public.is_system_caller(job_secret);
begin
  if not public.event_publish_authorized(p_school_id, job_secret) then
    raise exception 'not authorized to publish for this tenant';
  end if;
  if not is_system and p_actor_id is not null and p_actor_id <> auth.uid() then
    raise exception 'cannot publish on behalf of another actor';
  end if;
  insert into public.domain_events (type, school_id, payload, actor_id)
  values (p_type, p_school_id, coalesce(p_payload, '{}'::jsonb), coalesce(p_actor_id, auth.uid()))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.claim_domain_events(job_secret text, batch integer default 50)
  returns setof public.domain_events
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_caller(job_secret) then
    raise exception 'not authorized';
  end if;
  return query
    update public.domain_events
      set attempts = attempts + 1
    where id in (
      select id from public.domain_events
      where dispatched_at is null
      order by occurred_at
      limit greatest(batch, 1)
      for update skip locked
    )
    returning *;
end;
$$;

create or replace function public.mark_domain_event_dispatched(job_secret text, p_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_system_caller(job_secret) then
    raise exception 'not authorized';
  end if;
  update public.domain_events set dispatched_at = now() where id = p_id;
end;
$$;

-- 0078: audit append RPC, now via is_system_caller.
create or replace function public.record_audit(
  p_entity_type text,
  p_entity_id text,
  p_action text,
  p_school_id uuid default null,
  p_actor_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_ip text default null,
  p_request_id text default null,
  p_dedupe_key text default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  is_system boolean := public.is_system_caller(job_secret);
begin
  if not (
    public.app_current_role() = 'super_admin'
    or (p_school_id is not null and p_school_id = public.app_current_school_id())
    or is_system
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
