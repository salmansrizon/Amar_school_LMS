-- 0119_territory_cluster_assignment.sql
-- Lets a Distributor (or Government Official) be assigned directly to a
-- Cluster, not just a Location subtree or a single School. A Cluster is a
-- named subset of Schools attached to one Location node (0003) — location-
-- level assignment already reaches a Cluster's Schools via
-- schools_under_location's cluster branch (0004), but that also reaches any
-- OTHER Cluster hanging off the same node, which is too broad for "assign
-- this Distributor to exactly this Cluster."

alter table public.territory_assignments
  add column cluster_id uuid references public.clusters (id) on delete cascade;

alter table public.territory_assignments
  drop constraint one_target,
  add constraint one_target check (num_nonnulls(location_id, school_id, cluster_id) = 1);

-- Recreated to add the cluster branch alongside the existing school/location
-- ones; body otherwise unchanged from 0006/0107.
create or replace function public.school_reachable_by_me(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from territory_assignments ta
    where ta.assignee_id = auth.uid()
      and (
        ta.school_id = sid
        or (ta.location_id is not null
            and sid in (select id from public.schools_under_location(ta.location_id)))
        or (ta.cluster_id is not null
            and sid in (select id from public.schools where cluster_id = ta.cluster_id))
      )
  )
$$;

-- Recreated with a via_cluster branch folded into the same "broad" (non-
-- extended) side as via_location; is_extended keeps its original meaning —
-- true only when a School is reachable solely via a school-scoped row.
create or replace function public.my_territory_schools()
returns table (school_id uuid, name text, is_extended boolean)
language sql stable security definer set search_path = public as $$
  with mine as (select * from territory_assignments where assignee_id = auth.uid()),
  via_location as (
    select s.id, s.name
    from mine m
    cross join lateral public.schools_under_location(m.location_id) s
    where m.location_id is not null
  ),
  via_cluster as (
    select s.id, s.name
    from mine m join schools s on s.cluster_id = m.cluster_id
    where m.cluster_id is not null
  ),
  via_broad as (
    select * from via_location
    union
    select * from via_cluster
  ),
  via_school as (
    select s.id, s.name
    from mine m join schools s on s.id = m.school_id
    where m.school_id is not null
  )
  select distinct coalesce(b.id, x.id) as school_id,
         coalesce(b.name, x.name) as name,
         (b.id is null) as is_extended
  from via_school x
  full outer join via_broad b on b.id = x.id
$$;

-- Cross-assignee exclusivity: no School should end up reachable by two
-- different Distributors/Gov Officials at once, regardless of whether the
-- overlap comes from a School, Location, or Cluster row on either side.
-- Applies to every territory_assignments insert/update, not just the new
-- Cluster path — the same rule already silently needed to hold for
-- Location/School assignments too.
create function public.check_territory_conflict() returns trigger
language plpgsql as $$
declare
  target_schools uuid[];
  conflict_name text;
  conflict_count int;
begin
  select array_agg(s.id) into target_schools
  from public.schools s
  where (new.school_id is not null and s.id = new.school_id)
     or (new.location_id is not null and s.id in (select id from public.schools_under_location(new.location_id)))
     or (new.cluster_id is not null and s.cluster_id = new.cluster_id);

  if target_schools is null or array_length(target_schools, 1) is null then
    return new;
  end if;

  select p.full_name, count(*)
    into conflict_name, conflict_count
  from public.territory_assignments ta
  join public.profiles p on p.id = ta.assignee_id
  where ta.assignee_id <> new.assignee_id
    and ta.id <> new.id
    and (
      (ta.school_id is not null and ta.school_id = any (target_schools))
      or (ta.location_id is not null and exists (
            select 1 from public.schools_under_location(ta.location_id) su where su.id = any (target_schools)))
      or (ta.cluster_id is not null and exists (
            select 1 from public.schools s where s.cluster_id = ta.cluster_id and s.id = any (target_schools)))
    )
  group by p.full_name
  order by count(*) desc
  limit 1;

  if conflict_name is not null then
    raise exception 'territory conflict: % school(s) already assigned to %', conflict_count, conflict_name;
  end if;

  return new;
end $$;

drop trigger if exists territory_conflict_check on public.territory_assignments;
create trigger territory_conflict_check
  before insert or update on public.territory_assignments
  for each row execute function public.check_territory_conflict();
