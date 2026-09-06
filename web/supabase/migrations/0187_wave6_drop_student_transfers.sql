-- 0187_wave6_drop_student_transfers.sql
-- Wave 6 (issue #591), step 5: drop student_transfers, only after its
-- reconciliation report (0184) ran and was reviewed empty (confirmed: 0 rows
-- in every category, across all 52 Schools -- the table itself has zero rows
-- on this environment) and its last two live callers were retired (0186):
-- transferStudent() and the Promotion action now call
-- sync_student_legacy_placement instead of transfer_student(...), and the
-- Transfer History page now reads student_enrollments directly. Nothing in
-- the app writes to or reads from student_transfers any more.
--
-- transfer_student(...) is dropped too (both overloads: the original 4-arg
-- form from 0032, and the 5-arg p_new_roll form from 0120) -- its only job
-- was writing to the table this migration removes.
drop function if exists public.transfer_student(uuid, text, text, text);
drop function if exists public.transfer_student(uuid, text, text, text, integer);

-- wave6_reconcile_student_transfers (0184) has done its one job: it produced
-- the reviewed-empty report that authorized this drop, verified live (all 52
-- Schools) and by a fabricated-fixture integration test exercising all three
-- categories (tests/integration/wave6-transfers-reconciliation.test.ts,
-- removed in this same commit now that the table/function it exercised are
-- both retired -- its coverage job is done, not lost). It selects from
-- student_transfers by name (not dynamic SQL), so leaving it defined against
-- a table that no longer exists would only leave a function that errors the
-- moment anyone calls it -- drop it with the table it was built to retire.
drop function if exists public.wave6_reconcile_student_transfers(uuid);

-- Drops its own indexes, RLS policies, and the student_transfer_same_school
-- tenancy trigger (0033) along with it.
drop table if exists public.student_transfers;
