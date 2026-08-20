-- 0117_merge_duplicate_dhaka_division.sql
-- 0116 seeded a correctly-capitalized "Dhaka" division, but the database
-- already had a pre-existing "dhaka" (lowercase) division from before that
-- seed ran — 0116's `where not exists` name check is case-sensitive, so it
-- didn't recognize them as the same place, and both ended up sitting side
-- by side (confirmed live via Playwright against /super-admin/locations).
--
-- The stray "dhaka" had no district children visible in the tree, but a
-- school, cluster, territory assignment, or SMS-log entry can point at a
-- location directly at any level — so every FK reference is reparented onto
-- the correct "Dhaka" before the stray row is deleted, rather than assuming
-- it was unused. Idempotent: a no-op once the old row is gone (re-running
-- finds no "dhaka" left to merge).

do $$
declare
  old_id uuid;
  new_id uuid;
begin
  select id into old_id from public.locations where type = 'division' and name = 'dhaka';
  select id into new_id from public.locations where type = 'division' and name = 'Dhaka';

  if old_id is null or new_id is null or old_id = new_id then
    return;
  end if;

  update public.locations set parent_id = new_id where parent_id = old_id;
  update public.clusters set location_id = new_id where location_id = old_id;
  update public.schools set location_id = new_id where location_id = old_id;
  update public.territory_assignments set location_id = new_id where location_id = old_id;
  update public.super_admin_sms_log set location_id = new_id where location_id = old_id;

  delete from public.locations where id = old_id;
end $$;
