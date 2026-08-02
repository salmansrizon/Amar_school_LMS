-- 0081_feature_engine.sql
-- Feature Engine (map #258, ticket #263). Configurable module/feature
-- availability per school and per subscription plan, replacing the flat, mostly-
-- unenforced school_feature_flags (0073) as the module-availability authority.
--
-- Behavior preservation: today the 0073 flags are storage-only (only sms_metering
-- is actually enforced, in lib/sms/credit.ts) so every school currently sees
-- every module. This engine reproduces that by seeding every feature with
-- default_state='active' and assigning no school to a restrictive plan — so
-- resolution returns "enabled" for all existing schools until a Super Admin
-- explicitly disables a feature or assigns a limiting plan. The legacy flags and
-- sms_metering enforcement are left running as-is; migrating them onto this
-- engine is a scoped follow-up (avoids a dual source of truth here).

create table public.modules (
  key text primary key,
  label jsonb not null default '{}'::jsonb,
  sort integer not null default 0
);

create table public.features (
  key text primary key,
  module_key text not null references public.modules (key) on delete cascade,
  label jsonb not null default '{}'::jsonb,
  default_state text not null default 'active'
    check (default_state in ('active', 'disabled', 'trial', 'premium'))
);

create table public.feature_dependencies (
  feature_key text not null references public.features (key) on delete cascade,
  depends_on_key text not null references public.features (key) on delete cascade,
  primary key (feature_key, depends_on_key),
  constraint feature_dependency_not_self check (feature_key <> depends_on_key)
);

create table public.subscription_plans (
  key text primary key,
  label jsonb not null default '{}'::jsonb,
  is_default boolean not null default false
);

create table public.plan_features (
  plan_key text not null references public.subscription_plans (key) on delete cascade,
  feature_key text not null references public.features (key) on delete cascade,
  primary key (plan_key, feature_key)
);

create table public.school_plan (
  school_id uuid primary key references public.schools (id) on delete cascade,
  plan_key text not null references public.subscription_plans (key)
);

-- Per-school feature override (state + effective window). Absent row falls back
-- to the school's plan, then to the feature default_state.
create table public.school_features (
  school_id uuid not null references public.schools (id) on delete cascade,
  feature_key text not null references public.features (key) on delete cascade,
  state text not null check (state in ('active', 'disabled', 'trial', 'premium')),
  effective_from timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (school_id, feature_key)
);

alter table public.modules enable row level security;
alter table public.features enable row level security;
alter table public.feature_dependencies enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.school_plan enable row level security;
alter table public.school_features enable row level security;

-- Catalog is non-secret config: signed-in users read, super-admin manages.
do $$
declare t text;
begin
  foreach t in array array['modules', 'features', 'feature_dependencies', 'subscription_plans', 'plan_features'] loop
    execute format('create policy "authenticated reads %1$s" on public.%1$s for select using (auth.uid() is not null)', t);
    execute format('create policy "super admin manages %1$s" on public.%1$s for all using (public.app_current_role() = ''super_admin'')', t);
  end loop;
end $$;

-- Tenant-scoped tables: super-admin manages, school reads its own.
create policy "super admin manages school_plan" on public.school_plan
  for all using (public.app_current_role() = 'super_admin');
create policy "school reads own plan" on public.school_plan
  for select using (school_id = public.app_current_school_id());
create policy "super admin manages school_features" on public.school_features
  for all using (public.app_current_role() = 'super_admin');
create policy "school reads own features" on public.school_features
  for select using (school_id = public.app_current_school_id());

-- Seed catalog: one module + one feature per current School screen. Every
-- feature defaults to active so existing schools keep seeing everything.
insert into public.modules (key, label, sort) values
  ('students',   '{"bn":"শিক্ষার্থী","en":"Students"}', 1),
  ('employees',  '{"bn":"কর্মচারী","en":"Employees"}', 2),
  ('attendance', '{"bn":"উপস্থিতি","en":"Attendance"}', 3),
  ('classes',    '{"bn":"শ্রেণি ও পাঠ্যক্রম","en":"Class & Curriculum"}', 4),
  ('exams',      '{"bn":"পরীক্ষা ও ফলাফল","en":"Exams & Results"}', 5),
  ('fees',       '{"bn":"হিসাব ও ফি","en":"Accounting & Fees"}', 6),
  ('sms',        '{"bn":"এসএমএস","en":"SMS"}', 7),
  ('notices',    '{"bn":"প্রকাশনা","en":"Publishing"}', 8),
  ('feedback',   '{"bn":"মতামত","en":"Feedback"}', 9),
  ('institute',  '{"bn":"প্রতিষ্ঠান সেটআপ","en":"Institute Setup"}', 10);

insert into public.features (key, module_key, label, default_state)
  select key, key, label, 'active' from public.modules;

-- Seed real dependencies (exercise the resolver; no behavior change while all
-- features default active).
insert into public.feature_dependencies (feature_key, depends_on_key) values
  ('exams', 'students'),
  ('fees', 'students'),
  ('attendance', 'students');

-- Default plan granting every feature (schools are left unassigned, so
-- resolution uses default_state; the plan exists for future assignment).
insert into public.subscription_plans (key, label, is_default) values
  ('standard', '{"bn":"স্ট্যান্ডার্ড","en":"Standard"}', true);
insert into public.plan_features (plan_key, feature_key)
  select 'standard', key from public.features;

-- Resolver: is a feature enabled for a school? school override -> plan -> feature
-- default_state, then every dependency must also be enabled. Tenant-guarded.
create or replace function public.app_feature_enabled(p_school uuid, p_feature text)
  returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  self_enabled boolean;
  st text; eff timestamptz; exp timestamptz;
  def text;
  dep text;
begin
  if not (public.app_current_role() = 'super_admin' or p_school = public.app_current_school_id()) then
    raise exception 'not authorized to resolve features for this tenant';
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
    self_enabled := false; -- has a plan that does not grant this feature
  else
    select default_state into def from public.features where key = p_feature;
    self_enabled := coalesce(def in ('active', 'trial', 'premium'), false);
  end if;

  if not self_enabled then
    return false;
  end if;

  for dep in select depends_on_key from public.feature_dependencies where feature_key = p_feature loop
    if not public.app_feature_enabled(p_school, dep) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Set/clear a per-school feature override (super-admin or system), audited.
create or replace function public.set_school_feature(
  p_school uuid,
  p_feature text,
  p_state text,
  p_effective_from timestamptz default null,
  p_expires_at timestamptz default null,
  job_secret text default null
) returns void
  language plpgsql security definer set search_path = public as $$
declare
  before_state text;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized';
  end if;
  select state into before_state from public.school_features where school_id = p_school and feature_key = p_feature;

  insert into public.school_features (school_id, feature_key, state, effective_from, expires_at, updated_at)
  values (p_school, p_feature, p_state, p_effective_from, p_expires_at, now())
  on conflict (school_id, feature_key)
    do update set state = excluded.state, effective_from = excluded.effective_from,
      expires_at = excluded.expires_at, updated_at = now();

  perform public.record_audit(
    'school_feature', p_school || ':' || p_feature, 'configure',
    p_school, null,
    jsonb_build_object('state', before_state),
    jsonb_build_object('state', p_state, 'effective_from', p_effective_from, 'expires_at', p_expires_at),
    null, null, null, job_secret
  );
end;
$$;
