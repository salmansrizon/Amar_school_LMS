-- 0212_retire_legacy_rfid_sources.sql — CONTRACT phase of 0211.
--
-- Breaks any deployed code that still writes these: the pre-0211 staging code
-- inserts students.rfid_card_number on admission and
-- employees.rfid_card_number on employee create/edit. Applied before that code
-- was redeployed, accepted because the product has no real users yet.
--
-- After this, machine_enroll_infos.rfid_card_number is the only place an RFID
-- card number lives.

-- 1. Last copy: anything written to the legacy sources after 0211
--    ran. Same refuse-on-conflict rule as 0211's backfill.
select public._copy_legacy_rfid_into_machine_enroll_infos();
drop function public._copy_legacy_rfid_into_machine_enroll_infos();

-- 2. The profile columns. Their per-school unique indexes (0173) go with them.
alter table public.students drop column if exists rfid_card_number;
alter table public.employees drop column if exists rfid_card_number;

-- 3. The legacy card table. reconcile_attendance stopped reading it in 0211;
--    its RLS policies and composite FKs (0017/0020/0136) are dropped with it.
drop table if exists public.rfid_cards;
