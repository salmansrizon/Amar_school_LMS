-- 0078_audit_log.sql
-- Audit Engine (map #258, ticket #261). Immutable, append-only audit trail.
-- Populated automatically by subscribing to domain events (#260) and explicitly
-- via record_audit for non-event mutations. Immutability is enforced by RLS:
-- only SELECT policies exist, so no role can UPDATE or DELETE a posted row; all
-- writes go through the SECURITY DEFINER record_audit RPC (no service-role key).

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  -- Tenant scope; null for platform-level actions.
  school_id uuid references public.schools (id),
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('create', 'update', 'delete', 'approve', 'reject', 'configure')),
  before jsonb,
  after jsonb,
  ip text,
  request_id text,
  -- Idempotency key for at-least-once event-driven audit (event id). Null for
  -- explicit audit() calls, which always insert.
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint audit_log_entity_nonempty check (length(entity_type) > 0 and length(entity_id) > 0)
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at);
create index audit_log_school_idx on public.audit_log (school_id, created_at);
create unique index audit_log_dedupe_idx on public.audit_log (dedupe_key) where dedupe_key is not null;

alter table public.audit_log enable row level security;

-- Read only. No insert/update/delete policies: the table is append-only via the
-- definer RPC, and immutable (no update/delete path for any role).
create policy "super admin reads audit" on public.audit_log
  for select using (public.app_current_role() = 'super_admin');
create policy "members read own school audit" on public.audit_log
  for select using (
    school_id is not null and school_id = public.app_current_school_id()
  );

-- Append an audit entry. Authorized for super-admin, the tenant's own member, or
-- a system caller carrying the reconcile secret. Session callers may not
-- attribute an entry to another actor (only system callers may). When a
-- dedupe_key is supplied, a repeat insert is a no-op (idempotent event audit).
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
  is_system boolean := (job_secret is not null
    and exists (select 1 from public.vendor_secrets where key = 'reconcile' and value = job_secret));
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
