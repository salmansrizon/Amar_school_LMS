-- 0173_territory_exclusivity_is_a_distributor_rule.sql
-- Found by the exit gate for map #524 (#544), seeding the Gov Official fixture
-- the UAT report says is missing.
--
-- `check_territory_conflict` refused to assign a Gov Official the Dhaka division
-- because a Distributor already covers a school in it:
--
--     territory conflict: 1 school(s) already assigned to Dhaka North Distributor
--
-- It compared the incoming assignment against EVERY other assignee regardless of
-- role. Exclusivity is a Distributor rule — one seller per school, ADR 0010's
-- "ownership is explicit and forward-only". A Gov Official observing the same
-- schools is not a competing claim; it is the entire role. An Agent working
-- inside their own Distributor's territory is not one either, and was refused
-- for the same reason.
--
-- So the check now fires only when BOTH sides are Distributors. Everything else
-- about it is unchanged: same message, same "worst offender" reporting, same
-- three ways of describing a territory (school, location, cluster).
create or replace function public.check_territory_conflict() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_schools uuid[];
  conflict_name text;
  conflict_count int;
begin
  -- Only a Distributor can take a territory from another Distributor.
  if (select role from public.profiles where id = new.assignee_id) <> 'distributor' then
    return new;
  end if;

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
    and p.role = 'distributor'
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
