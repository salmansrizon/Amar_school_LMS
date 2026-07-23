-- Buildings & rooms master data (issue #93, map #91, docs/improvement.md §2A):
-- examination venues are a two-level model — buildings, each holding rooms —
-- configured as institute master data, independent of any exam.
--
-- `rooms` (0022) was a flat, school-scoped list. Every existing room is
-- attached to an auto-created "Main Building" per school and `building_id` is
-- `not null` from day one (map #91 grilling decision 7): no nullable column,
-- so no orphan-room branch anywhere downstream.

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint building_name_unique unique (school_id, name),
  -- Target for rooms' composite FK: a room's building must be in the room's
  -- own school (RLS does not guard FK cascades — same reasoning as 0024).
  constraint buildings_id_school_unique unique (id, school_id)
);
create index buildings_school_idx on public.buildings (school_id);

alter table public.buildings enable row level security;
create policy "school members manage buildings" on public.buildings
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages buildings" on public.buildings
  for all using (public.app_current_role() = 'super_admin');

-- Every school gets its Main Building, whether or not it has rooms yet, so a
-- school adding its first room already has somewhere to put it.
insert into public.buildings (school_id, name)
select id, 'Main Building' from public.schools
on conflict (school_id, name) do nothing;

alter table public.rooms add column building_id uuid;

update public.rooms r
set building_id = b.id
from public.buildings b
where b.school_id = r.school_id and b.name = 'Main Building';

alter table public.rooms alter column building_id set not null;
alter table public.rooms
  add constraint rooms_building_same_school
    foreign key (building_id, school_id) references public.buildings (id, school_id)
    on delete cascade;
create index rooms_building_idx on public.rooms (building_id);

-- A room identifier is unique within its building, not within the school:
-- "Room 101" legitimately exists in both Building A and Building B.
alter table public.rooms drop constraint room_name_unique;
alter table public.rooms add constraint room_name_unique_in_building unique (building_id, name);
