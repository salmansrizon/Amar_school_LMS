# Fees and finance migrations — rollout notes

Three migration files, written on a worktree branch and **not applied**. Staging and production share one database, so each is live for production data the moment it is applied.

| Order | File | Issue | Changes existing rows? |
|---|---|---|---|
| 1 | `web/supabase/migrations/0230_fee_collection_fee_amount.sql` | #678 | No |
| 2 | `web/supabase/migrations/0231_fee_record_void.sql` | #683 | No |
| 3 | `web/supabase/migrations/0232_director_capital_guard.sql` | #681 | No |

The three are independent: the app probes for each one (`web/lib/fee-columns.ts`) and works with any subset applied. The order above is only the suggested one. Each file carries its own header with the same pre-check and rollback given here.

No file is marked `DATA CHANGE`: none of them updates, deletes or backfills a row.

Integration tests written beside the existing ones and **not run** (the suite writes to the shared database): `web/tests/integration/fee-amount-column.test.ts`, `fee-record-void.test.ts`, `director-capital-guard.test.ts`.

## 1. `0230_fee_collection_fee_amount.sql` (#678)

**What.** `fee_collection_records.fee_amount numeric(12,2)`, nullable, `check (fee_amount >= 0)`.

**Pre-check (read-only).**

```sql
select count(*)                               as fee_records,
       count(*) filter (where due_amount > 0) as fee_derivable_today,
       count(*) filter (where due_amount = 0) as fee_unknown_stays_null
  from public.fee_collection_records;

select count(*) as column_already_there      -- expect 0
  from information_schema.columns
 where table_schema = 'public' and table_name = 'fee_collection_records'
   and column_name = 'fee_amount';
```

**Expected change.** One new column, NULL on every existing row. No row is rewritten and `updated_at` does not move.

**No backfill, on purpose.** For a row with something still due, the app derives the same figure when it reads the row, so a backfill adds nothing. For a row with nothing due the fee cannot be known (exact payment or advance?) and stays NULL. And any `UPDATE` of this table runs `fee_record_touch` (0016), which would set `updated_at = now()` on every fee record — the date the general ledger and the receipt show. If a SQL report later needs the column filled, the exact rows are `due_amount > 0 and fee_amount is null` with `fee_amount = pay_amount + due_amount - fine_amount + adjust_amount` (only where that is `>= 0`), and `fee_record_touch` must be disabled for the statement.

**App behaviour.** Before: unchanged. After: `saveFeeRecord` stores the fee on every new record and on every edit (except an edit of an old nothing-due row where the operator did not touch the reconstructed fee); the edit form opens with the stored fee; the receipt prints a fee line and, when more was received than fee + fine − adjustment, an advance line.

**Rollback.**

```sql
alter table public.fee_collection_records drop column if exists fee_amount;
notify pgrst, 'reload schema';
```

Loses every fee stored since applying. The app falls back to the derived figure within a minute.
