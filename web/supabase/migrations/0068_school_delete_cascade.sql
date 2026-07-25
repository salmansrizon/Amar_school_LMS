-- 0068_school_delete_cascade.sql
-- Make super-admin school delete (issue #161) actually cascade. Two FKs to
-- schools were created WITHOUT a delete rule, so a real school (which always
-- has at least the owner profile, and often redeemed subscription codes) hit a
-- foreign-key violation and the delete failed. Add ON DELETE CASCADE to both.
-- Every other schools child already cascades (verified across 0001–0067).
--
-- Pre-launch shared DB: breaking/altering FKs is allowed here (map decision).

-- profiles.school_id → deleting a school removes its owner/staff profile rows.
-- (auth.users rows are left intact — harmless orphans, no service-role cleanup.)
alter table public.profiles
  drop constraint if exists profiles_school_id_fkey,
  add constraint profiles_school_id_fkey
    foreign key (school_id) references public.schools (id) on delete cascade;

-- subscription_codes.redeemed_school_id → the redeemed_pair check keeps
-- (redeemed_school_id, redeemed_at) null-together, so SET NULL would violate it;
-- cascade-delete the redeemed code rows for the removed school instead.
alter table public.subscription_codes
  drop constraint if exists subscription_codes_redeemed_school_id_fkey,
  add constraint subscription_codes_redeemed_school_id_fkey
    foreign key (redeemed_school_id) references public.schools (id) on delete cascade;
