-- The same territory (or extended School) assigned twice to one assignee is
-- meaningless — guard it at the DB level.
create unique index territory_assignment_unique_location
  on public.territory_assignments (assignee_id, location_id) where location_id is not null;
create unique index territory_assignment_unique_school
  on public.territory_assignments (assignee_id, school_id) where school_id is not null;
