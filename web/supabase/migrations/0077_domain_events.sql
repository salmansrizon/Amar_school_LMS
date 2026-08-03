-- 0077_domain_events.sql
-- Event Architecture outbox (map #258, ticket #260). Every significant business
-- action publishes a domain event here. Publishing is a SERVER-side concern (no
-- service-role key in this env), so writes go through SECURITY DEFINER RPCs
-- gated by the same vendor_secrets 'reconcile' secret the cron jobs use, or by
-- the caller's own tenant/super-admin authority. In-process synchronous
-- consumers run right after publish (TS engine); a Vercel cron drains any still-
-- undispatched rows for async consumers. At-least-once delivery: consumers must
-- be idempotent on domain_events.id.

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  -- Tenant scope; null for platform-level events (SchoolCreated, DistributorApproved…).
  school_id uuid references public.schools (id),
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  -- Null until every consumer has processed the event; set by the TS engine
  -- (sync path) or the cron drain (async path).
  dispatched_at timestamptz,
  attempts integer not null default 0,
  constraint domain_events_type_nonempty check (length(type) > 0)
);

-- Drain scans undispatched rows oldest-first.
create index domain_events_undispatched_idx
  on public.domain_events (occurred_at)
  where dispatched_at is null;

alter table public.domain_events enable row level security;

-- Super admin reads the whole event log; school members read their own tenant's.
-- No direct writes: enqueue/claim/mark go through the definer RPCs below, so the
-- outbox stays append-only and callers need no broad insert grant.
create policy "super admin reads events" on public.domain_events
  for select using (public.app_current_role() = 'super_admin');
create policy "members read own school events" on public.domain_events
  for select using (
    school_id is not null and school_id = public.app_current_school_id()
  );

-- Authority to publish for a given tenant: super-admin, the tenant's own member,
-- or a system/cron caller carrying the reconcile secret. Platform-level events
-- (school_id null) require super-admin or the reconcile secret.
create or replace function public.event_publish_authorized(p_school_id uuid, job_secret text)
  returns boolean language sql stable security definer set search_path = public as $$
  select
    public.app_current_role() = 'super_admin'
    or (p_school_id is not null and p_school_id = public.app_current_school_id())
    or (job_secret is not null
        and exists (select 1 from public.vendor_secrets where key = 'reconcile' and value = job_secret));
$$;

-- Enqueue an event (undispatched). The TS engine dispatches + marks; this RPC
-- only appends the row.
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
  is_system boolean := (job_secret is not null
    and exists (select 1 from public.vendor_secrets where key = 'reconcile' and value = job_secret));
begin
  if not public.event_publish_authorized(p_school_id, job_secret) then
    raise exception 'not authorized to publish for this tenant';
  end if;
  -- A session caller may only attribute the event to itself; only a trusted
  -- system caller (reconcile secret) may set actor_id on behalf of another user.
  if not is_system and p_actor_id is not null and p_actor_id <> auth.uid() then
    raise exception 'cannot publish on behalf of another actor';
  end if;
  insert into public.domain_events (type, school_id, payload, actor_id)
  values (p_type, p_school_id, coalesce(p_payload, '{}'::jsonb), coalesce(p_actor_id, auth.uid()))
  returning id into new_id;
  return new_id;
end;
$$;

-- Claim a batch of undispatched events for async processing (cron drain).
-- Increments attempts and skips rows another worker already holds.
create or replace function public.claim_domain_events(job_secret text, batch integer default 50)
  returns setof public.domain_events
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vendor_secrets where key = 'reconcile' and value = job_secret) then
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

-- Mark one event dispatched once all its consumers have succeeded.
create or replace function public.mark_domain_event_dispatched(job_secret text, p_id uuid)
  returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'not authorized';
  end if;
  update public.domain_events set dispatched_at = now() where id = p_id;
end;
$$;
