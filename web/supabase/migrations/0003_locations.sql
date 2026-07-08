-- Territory & Location hierarchy (issue #3): 4-level Bangladesh location tree,
-- Clusters, and the shared recursive "schools under node" primitive (PRD §6.1).

create type public.location_type as enum ('division', 'district', 'upazila', 'union');

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.location_type not null,
  parent_id uuid references public.locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Divisions are roots; every other level must hang off a parent.
  constraint division_is_root check ((type = 'division') = (parent_id is null))
);

create index locations_parent_idx on public.locations (parent_id);

-- Parent must be exactly one level up (division → district → upazila → union).
create function public.check_location_parent() returns trigger
language plpgsql as $$
declare
  parent_type public.location_type;
  expected public.location_type;
begin
  if new.parent_id is null then
    return new;
  end if;
  select type into parent_type from public.locations where id = new.parent_id;
  expected := case new.type
    when 'district' then 'division'::public.location_type
    when 'upazila' then 'district'::public.location_type
    when 'union' then 'upazila'::public.location_type
  end;
  if parent_type is distinct from expected then
    raise exception 'a % must be created under a %, got %', new.type, expected, parent_type;
  end if;
  return new;
end $$;

create trigger location_parent_level
  before insert or update of parent_id, type on public.locations
  for each row execute function public.check_location_parent();

create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_id uuid not null references public.locations (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.schools
  add column location_id uuid references public.locations (id) on delete set null,
  add column cluster_id uuid references public.clusters (id) on delete set null;

alter table public.locations enable row level security;
alter table public.clusters enable row level security;

-- Reference data: any signed-in role may read; only Super Admin writes.
create policy "authenticated read locations" on public.locations
  for select to authenticated using (true);
create policy "super admin manages locations" on public.locations
  for all using (public.app_current_role() = 'super_admin');

create policy "authenticated read clusters" on public.clusters
  for select to authenticated using (true);
create policy "super admin manages clusters" on public.clusters
  for all using (public.app_current_role() = 'super_admin');

-- The shared recursive primitive (PRD §6.1): every School under a node and its
-- descendants. SECURITY INVOKER on purpose — RLS decides which of those
-- Schools the caller may actually see.
create function public.schools_under_location(location uuid)
returns setof public.schools
language sql stable as $$
  with recursive nodes as (
    select id from public.locations where id = location
    union all
    select l.id from public.locations l join nodes n on l.parent_id = n.id
  )
  select s.* from public.schools s where s.location_id in (select id from nodes)
$$;
