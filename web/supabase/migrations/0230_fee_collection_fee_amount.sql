-- 0230_fee_collection_fee_amount.sql
-- #678: store the billed fee on a Fee Collection Record.
--
-- What: fee_collection_records.fee_amount numeric(12,2), NULLABLE, >= 0.
-- Why: the record kept only pay / fine / adjust / due. The edit form had to
--   work the fee back out (lib/fees.ts billedFeeAmount: pay + due - fine +
--   adjust). That is exact only while something is still due; once due is 0 an
--   exact payment and an overpayment (#695) are the same four numbers, and the
--   receipt had no fee line at all.
-- Effect on existing data: NONE. Nullable column, no default: a catalogue-only
--   change, no row is rewritten, no trigger fires, updated_at is untouched.
--   Existing rows keep fee_amount NULL.
-- Backfill: deliberately NOT done, here or in a second file.
--   * For a row with due_amount > 0 the app derives the same figure at read
--     time, so a backfill would add nothing the screens do not already show.
--   * For a row with due_amount = 0 the fee cannot be known (exact payment or
--     advance?) and must stay NULL: never guess.
--   * Any UPDATE of this table runs fee_record_touch (0016), which sets
--     updated_at = now(). The general ledger page and the receipt both date a
--     record by updated_at, so a backfill would re-date every fee record.
--   The column fills as records are saved: saveFeeRecord writes it on every
--   insert, and on an edit unless the form was only showing a reconstructed
--   figure the operator did not touch.
-- Student portal: the student_fee_record view (0147) lists its columns one by
--   one and does not carry fee_amount. It must stay that way (ADR 0015: the
--   list price next to the bill tells the Student about the waiver).
-- App before / after: lib/fee-columns.ts probes for the column. Absent: the
--   app saves and shows exactly what it does today. Present: the fee is stored
--   and shown.
--
-- PRE-CHECK (read-only; run before applying):
--   select count(*)                                  as fee_records,
--          count(*) filter (where due_amount > 0)    as fee_derivable_today,
--          count(*) filter (where due_amount = 0)    as fee_unknown_stays_null
--     from public.fee_collection_records;
--   select count(*) as column_already_there          -- expect 0
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'fee_collection_records'
--      and column_name = 'fee_amount';
--
-- POST-CHECK (read-only):
--   select count(*) filter (where fee_amount is not null) as stored  -- expect 0 right after applying
--     from public.fee_collection_records;
--
-- Rollback (loses every fee stored since applying; the app falls back to the
--   derived figure by itself):
--   alter table public.fee_collection_records drop column if exists fee_amount;
--   notify pgrst, 'reload schema';
-- Idempotent.

alter table public.fee_collection_records
  add column if not exists fee_amount numeric(12, 2) check (fee_amount >= 0);

comment on column public.fee_collection_records.fee_amount is
  'Billed fee for the month before fine and adjustment (#678). NULL = not recorded (row older than 0230); never backfilled by guessing.';

-- PostgREST learns the new shape at once; otherwise the app keeps taking its
-- "not applied yet" path until the schema cache reloads by itself.
notify pgrst, 'reload schema';
