-- Indexes for the schools_under_location query path.
create index schools_location_idx on public.schools (location_id);
create index schools_cluster_idx on public.schools (cluster_id);
create index clusters_location_idx on public.clusters (location_id);
