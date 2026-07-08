-- A School may be tied to a node only through its Cluster (cluster_id set,
-- location_id null). The shared primitive must include those too, or every
-- downstream Territory feature silently under-counts.

create or replace function public.schools_under_location(location uuid)
returns setof public.schools
language sql stable as $$
  with recursive nodes as (
    select id from public.locations where id = location
    union all
    select l.id from public.locations l join nodes n on l.parent_id = n.id
  )
  select s.* from public.schools s
  where s.location_id in (select id from nodes)
     or s.cluster_id in (
       select c.id from public.clusters c where c.location_id in (select id from nodes)
     )
$$;
