-- 0092_partner_management.sql
-- Partner Management (map #258, ticket #270). Distributor KYC + status lifecycle,
-- agent assignments, CRM pipeline, and partner tasks — consuming the engines
-- (onboarding via the Workflow engine's seeded distributor_onboarding definition,
-- commission via the Financial engine, audit via record_audit).
--
-- Scope note: built additively on the existing 'dealer' app_role value; the
-- cosmetic 'dealer'->'distributor' enum + /dealer route rename (map #222 decision)
-- is a separate cross-cutting sweep (9 SQL policies + 10 TS files + route group),
-- deferred to keep this change low-risk. "distributor" here = a profile whose role
-- is the (legacy-named) dealer role.

create table public.distributor_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  trade_license text,
  nid text,
  bank_details jsonb not null default '{}'::jsonb,
  agreement_status text not null default 'pending' check (agreement_status in ('pending', 'accepted')),
  agreement_signed_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'under_review', 'approved', 'suspended', 'blocked')),
  created_at timestamptz not null default now()
);

create table public.agent_assignments (
  agent_id uuid primary key references public.profiles (id) on delete cascade,
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now()
);
create index agent_assignments_distributor_idx on public.agent_assignments (distributor_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  school_name text not null,
  contact_name text,
  contact_phone text,
  stage text not null default 'new' check (stage in ('new', 'contacted', 'demo', 'negotiation', 'won', 'lost')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_distributor_idx on public.leads (distributor_id, stage);

create table public.partner_tasks (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.profiles (id) on delete cascade,
  assignee_id uuid references public.profiles (id) on delete set null,
  title text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create index partner_tasks_distributor_idx on public.partner_tasks (distributor_id, status);

alter table public.distributor_profiles enable row level security;
alter table public.agent_assignments enable row level security;
alter table public.leads enable row level security;
alter table public.partner_tasks enable row level security;

-- Distributor sees/edits its own record; super-admin manages all.
create policy "super admin manages distributor_profiles" on public.distributor_profiles
  for all using (public.app_current_role() = 'super_admin');
create policy "distributor reads own profile" on public.distributor_profiles
  for select using (profile_id = auth.uid());

create policy "super admin manages agent_assignments" on public.agent_assignments
  for all using (public.app_current_role() = 'super_admin');
create policy "agent reads own assignment" on public.agent_assignments
  for select using (agent_id = auth.uid());
create policy "distributor reads its agents" on public.agent_assignments
  for select using (distributor_id = auth.uid());

-- Distributor owns its CRM leads + tasks; super-admin oversees.
create policy "super admin manages leads" on public.leads
  for all using (public.app_current_role() = 'super_admin');
create policy "distributor manages own leads" on public.leads
  for all using (distributor_id = auth.uid()) with check (distributor_id = auth.uid());

create policy "super admin manages partner_tasks" on public.partner_tasks
  for all using (public.app_current_role() = 'super_admin');
create policy "distributor manages own tasks" on public.partner_tasks
  for all using (distributor_id = auth.uid()) with check (distributor_id = auth.uid());
create policy "assignee reads task" on public.partner_tasks
  for select using (assignee_id = auth.uid());

-- Set a distributor's lifecycle status (super/system), audited + event on approval.
create or replace function public.set_distributor_status(p_distributor uuid, p_status text, job_secret text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare before_status text;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select status into before_status from public.distributor_profiles where profile_id = p_distributor;
  update public.distributor_profiles set status = p_status where profile_id = p_distributor;
  if p_status = 'approved' then
    perform public.publish_domain_event('DistributorApproved', null,
      jsonb_build_object('distributor', p_distributor), null, job_secret);
  end if;
  perform public.record_audit('distributor', p_distributor::text, 'configure', null, null,
    jsonb_build_object('status', before_status), jsonb_build_object('status', p_status), null, null, null, job_secret);
end;
$$;
