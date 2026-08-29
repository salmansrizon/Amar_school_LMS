-- 0106_school_owner_permission.sql
-- Complete the Policy-pipeline route migration (#262/#271): seed the owner-only
-- permission so requireSchoolOwner resolves through the Policy engine too.
insert into public.permissions (key, description) values
  ('school.owner', 'Owner-only school actions')
  on conflict (key) do nothing;
insert into public.role_permissions (role_key, permission_key) values
  ('school_owner', 'school.owner')
  on conflict do nothing;
