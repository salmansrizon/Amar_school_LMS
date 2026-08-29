-- 0080_policy_engine.sql
-- Policy Engine (map #258, ticket #262). Centralizes authorization into config
-- tables + a single app_has_permission() resolver, replacing scattered role
-- checks. Seeded to mirror today's behavior EXACTLY (no super-admin wildcard —
-- super_admin is not a school member today, so it is granted only its own
-- access permission). RLS stays the DB backstop; this is the app-layer pipeline.

create table public.roles (
  key text primary key,
  label jsonb not null default '{}'::jsonb
);

create table public.permissions (
  key text primary key,
  description text not null default ''
);

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

-- PBAC rule store (context-based policies beyond role grants). Seeded minimal;
-- consumed as the engine grows.
create table public.policies (
  key text primary key,
  config jsonb not null default '{}'::jsonb
);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.policies enable row level security;

-- Config is non-secret and needed to resolve authz: any signed-in user reads it;
-- only super-admin mutates (and grants go through set_role_permission, audited).
do $$
declare t text;
begin
  foreach t in array array['roles', 'permissions', 'role_permissions', 'policies'] loop
    execute format('create policy "authenticated reads %1$s" on public.%1$s for select using (auth.uid() is not null)', t);
    execute format('create policy "super admin manages %1$s" on public.%1$s for all using (public.app_current_role() = ''super_admin'')', t);
  end loop;
end $$;

-- Seed roles (current app_role enum values; ''dealer'' renamed to distributor in #270).
insert into public.roles (key, label) values
  ('super_admin',  '{"bn":"সুপার অ্যাডমিন","en":"Super Admin"}'),
  ('school_owner', '{"bn":"স্কুল মালিক","en":"School Owner"}'),
  ('staff_user',   '{"bn":"স্টাফ","en":"Staff User"}'),
  ('dealer',       '{"bn":"ডিলার","en":"Dealer"}'),
  ('gov_official', '{"bn":"সরকারি কর্মকর্তা","en":"Government Official"}');

-- Seed permission catalog (v1 = the route-group + owner-only capabilities that
-- exist today; per-screen staff grants remain in staff_permissions for now).
insert into public.permissions (key, description) values
  ('super_admin.access', 'Access the Super Admin app group'),
  ('dealer.access',      'Access the Dealer app group'),
  ('gov.access',         'Access the Government Official app group'),
  ('school.access',      'Access the School app group (owner or staff)'),
  ('institute.manage',   'Manage the institute profile (owner-only)');

-- Seed grants mirroring current behavior exactly.
insert into public.role_permissions (role_key, permission_key) values
  ('super_admin', 'super_admin.access'),
  ('dealer',      'dealer.access'),
  ('gov_official','gov.access'),
  ('school_owner','school.access'),
  ('school_owner','institute.manage'),
  ('staff_user',  'school.access');

-- The single authorization resolver: does the caller's role grant a permission?
create or replace function public.app_has_permission(p_permission text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.role_permissions rp
    where rp.role_key = public.app_current_role()::text
      and rp.permission_key = p_permission
  );
$$;

-- Grant/revoke a role permission (super-admin or system), audited.
create or replace function public.set_role_permission(
  p_role_key text,
  p_permission_key text,
  p_granted boolean,
  job_secret text default null
) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized';
  end if;
  if p_granted then
    insert into public.role_permissions (role_key, permission_key)
    values (p_role_key, p_permission_key) on conflict do nothing;
  else
    delete from public.role_permissions where role_key = p_role_key and permission_key = p_permission_key;
  end if;
  perform public.record_audit(
    'role_permission', p_role_key || ':' || p_permission_key,
    case when p_granted then 'create' else 'delete' end,
    null, null, null, jsonb_build_object('granted', p_granted), null, null, null, job_secret
  );
end;
$$;
