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

## 2. `0231_fee_record_void.sql` (#683)

**What.**

1. `fee_collection_records.void_at`, `void_by`, `void_reason` (all nullable) and the check `fee_record_void_has_reason` (a voided row has a reason of 1–500 characters; an active row has all three NULL).
2. Trigger `fee_record_void_guard` (before insert or update): only the School Owner voids; a reason is required; the database stamps `void_at = now()` and `void_by = auth.uid()`; a void may change no other field; a voided row can never be changed or un-voided; a row cannot be inserted already voided. It restores `updated_at`, so the payment keeps its date.
3. Trigger `fee_gl_void` (after update of `void_at`): the reversing general-ledger entry, in the same transaction, through `fee_gl_apply` (0097).
4. `fee_post_gl_delete` (0097) is replaced with the same body plus one line: a voided row is skipped, because its money is already reversed.
5. The unique constraint `one_record_per_student_month` is replaced by the partial unique index `one_active_fee_record_per_student_month ... where void_at is null`, so a voided month can be collected again.
6. The view `student_fee_record` (0147) is replaced with the same eight columns plus `where f.void_at is null`.

**Pre-check (read-only).**

```sql
-- a. the old constraint is there and holds (expect 1 row, then 0 rows)
select conname from pg_constraint
 where conrelid = 'public.fee_collection_records'::regclass
   and conname = 'one_record_per_student_month';
select student_id, month, year, count(*) from public.fee_collection_records
 group by 1, 2, 3 having count(*) > 1;

-- b. the two objects this file replaces are still as 0097 / 0147 wrote them
select pg_get_functiondef('public.fee_post_gl_delete()'::regprocedure);
select pg_get_viewdef('public.student_fee_record'::regclass, true);

-- c. trigger names: fee_record_void_guard must sort after fee_record_touch
select tgname from pg_trigger
 where tgrelid = 'public.fee_collection_records'::regclass and not tgisinternal
 order by tgname;

-- d. none of the new column names is taken (expect 0 rows)
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'fee_collection_records'
   and column_name in ('void_at', 'void_by', 'void_reason');
```

**Expected change.** No row changes. Three NULL columns, one check, one index in place of one constraint, two new trigger functions, one replaced function, one replaced view.

**Check before applying: `on conflict (student_id, month, year)`.** After this migration that conflict target has no constraint to match and the statement fails with `42P10`. The two users in this repository were changed in the same commit and now work before and after: `web/supabase/staging-seed.sql` (bare `on conflict do nothing`) and `web/tests/integration/staff-screen-grants.test.ts` (find, then insert). Another developer is working on `staging`: search that branch for `student_id, month, year` and `student_id,month,year` first.

**Decisions taken (each can be reversed).**

- Only the School Owner can void (issue's open question "manager approval?"). To let office staff void: change the role test in `fee_record_void_guard` and in `voidFeeRecord` (`web/app/school/fees/actions.ts`) and `canVoid` in the two pages.
- Full void only; no partial reversal. A partial correction is still an edit.
- A void cannot be undone in the app. The remedy for a mistaken void is to collect the month again.
- A voided record stays in the month's list and in the drawer history, marked "Voided", counted in no total; the receipt shows a "Voided" block (also on paper) with date, name and reason, and its ledger-impact list shows the reversing entry.
- The Student portal does not show voided records at all.

**App behaviour.** Before: no void control anywhere; the `voidFeeRecord` action answers "not available yet — nothing was changed". After: the control appears on the receipt (and as a link in the list drawer) for the School Owner.

**Not done here.** A School member can still `delete` a fee record through the API (policy `for all`, 0016); the app has no such action. Closing that is a separate decision because deleting a Student cascades to their fee records.

**Rollback.** Only while both of these return nothing — otherwise stop, because a voided row would come back to life with its ledger entry already reversed, or the old constraint could not be restored without deleting a financial row:

```sql
select id from public.fee_collection_records where void_at is not null limit 1;
select student_id, month, year from public.fee_collection_records
 group by 1, 2, 3 having count(*) > 1 limit 1;
```

Then, in this order:

```sql
drop trigger if exists fee_gl_void on public.fee_collection_records;
drop trigger if exists fee_record_void_guard on public.fee_collection_records;
create or replace function public.fee_post_gl_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
declare cash_acct text;
begin
  cash_acct := case when old.payment_method = 'cash' then '1000' else '1050' end;
  perform public.fee_gl_apply(old.id, old.school_id,
    'Fee reversal ' || old.month || '/' || old.year,
    -round(old.pay_amount * 100)::bigint, -round(old.fine_amount * 100)::bigint, cash_acct);
  return old;
end;
$$;
create or replace view public.student_fee_record with (security_invoker = off, security_barrier = true) as
  select f.id, f.month, f.year, f.pay_amount, f.fine_amount, f.due_amount, f.payment_method, f.updated_at
    from public.fee_collection_records f
    join public.students me
      on me.id = f.student_id and me.profile_id = auth.uid() and me.archived_at is null;
alter table public.fee_collection_records
  add constraint one_record_per_student_month unique (student_id, month, year);
drop index if exists public.one_active_fee_record_per_student_month;
alter table public.fee_collection_records drop constraint if exists fee_record_void_has_reason;
drop function if exists public.fee_post_gl_void();
drop function if exists public.fee_record_void_guard();
alter table public.fee_collection_records
  drop column if exists void_reason, drop column if exists void_by, drop column if exists void_at;
notify pgrst, 'reload schema';
```

## 3. `0232_director_capital_guard.sql` (#681)

**Cause of the disagreeing figures.** `director_capital_balances.balance` is a running total kept by an insert-only trigger (0055). Deleting a transaction left its amount in the balance and its entry in the general ledger. `web/tests/integration/accounting-ii.test.ts` deleted its own two rows (+10,000, −4,000) as the School Owner on every run, so each run left ৳6,000 in Test School A's balance with no transaction behind it. That test now settles with an opposite transaction and deletes nothing.

**What.** One trigger, `director_capital_transaction_guard` (before update or delete), on `director_capital_transactions`:

- update: `amount`, `txn_type`, `school_id`, `balance_after` cannot change, for any caller (`txn_date` and `note` can);
- delete by a signed-in School member: refused;
- delete from the SQL editor, the service role or a Super Admin: allowed, and reversed — the balance moves back by the row's amount and a contra entry `dircap:<id>:reversal` is posted to the general ledger;
- delete because the School itself is being deleted (cascade): allowed, nothing adjusted.

**Pre-check (read-only). Keep the output: it is the discrepancy report for #681.**

```sql
-- a. stored balance against the transactions, per School
select b.school_id, s.name,
       b.balance                      as stored_balance,
       coalesce(t.net, 0)             as net_of_transactions,
       b.balance - coalesce(t.net, 0) as unexplained,
       coalesce(t.txns, 0)            as transactions
  from public.director_capital_balances b
  join public.schools s on s.id = b.school_id
  left join (
    select school_id,
           sum(case when txn_type = 'invest' then amount else -amount end) as net,
           count(*) as txns
      from public.director_capital_transactions group by school_id
  ) t on t.school_id = b.school_id
 where b.balance <> coalesce(t.net, 0);

-- b. the same account in the general ledger (taka), for comparison
select e.school_id, sum(l.credit - l.debit) / 100.0 as gl_director_capital
  from public.gl_lines l join public.gl_entries e on e.id = l.entry_id
 where l.account_code = '3000' group by e.school_id;

-- c. the trigger name is free (expect 0 rows)
select tgname from pg_trigger
 where tgrelid = 'public.director_capital_transactions'::regclass
   and tgname = 'director_capital_transaction_guard';
```

Expected for (a), from the figures the audit saw in the app: Test School A, stored ৳13,95,000, transactions ৳81,000, unexplained ৳13,14,000. This was **not** re-read from the database in this work (no SQL was run); the query is how to confirm it. Any other School in (a) is a new finding.

**Expected change.** None to data. Query (a) returns the same rows after applying as before.

**Not written, on purpose: the correction of the existing ৳13,14,000.** It changes a balance, so it is the owner's decision. The two honest options are (1) set the balance to the sum of the transactions (Test School A only, test data), or (2) keep the balance and record the difference as a dated opening entry. Until then the page shows it as the opening balance, and opening + invested − withdrawn = balance holds on screen.

**Effect on the test-data cleanup (#686).** After 0232, deleting test capital rows from the SQL editor lowers the stored balance by their amount and posts contra ledger entries. Do the cleanup after 0232 and the balance follows the rows by itself; do it before and the balance drifts further.

**Unverified.** The cascade branch relies on the School row no longer being visible to the child row's trigger during `on delete cascade`. Not tested (no School can be deleted on the shared database). Try a School delete on a branch database before relying on it.

**Rollback.**

```sql
drop trigger if exists director_capital_transaction_guard on public.director_capital_transactions;
drop function if exists public.director_capital_guard();
notify pgrst, 'reload schema';
```

## #695 — no migration

Decision taken: **keep the acknowledgement** as it is (the issue names no recommendation, and "carry forward" needs a stored credit balance, which is a data change and a product decision). What changed for #695 comes from `0230`: once the fee is stored, the advance (received − (fee + fine − adjustment)) is known for each record and the receipt prints it as its own line. Nothing is carried to another month. Carry-forward stays item 2.3 of the migration index.

## Found while doing this, not fixed

| Finding | Where | Why it was left |
|---|---|---|
| The general ledger debits cash by `pay_amount + fine_amount` (0097), but the collection form treats the received amount as **including** the fine (payable = fee + fine − adjustment; due = payable − received). A ৳500 fee with a ৳50 fine, ৳550 received, posts ৳600 to cash. The receipt's "Total" line (`pay + fine − adjust`) has the same reading | `0097_fee_gl_review_fixes.sql`, `app/school/fees/receipt/[id]/page.tsx` | Changing it rewrites what existing ledger entries mean. Needs the owner's decision on what `pay_amount` is, then a migration. The void in `0231` deliberately mirrors the existing posting so a void nets to zero either way |
| `bank_cash_transactions` has the same insert-only balance trigger as director capital: a deleted or edited row leaves `bank_cash_accounts.balance` wrong | `0055_accounting_ii_books.sql` | Outside the four issues. Same guard as `0232` would fit |
| Vouchers, bank/cash and director capital post to the general ledger on insert only (0098); a deleted voucher leaves its ledger entry. The integration tests delete vouchers as the owner | `0098_accounting_ii_gl.sql`, `tests/integration/accounting-ii.test.ts` | Outside the four issues |
| A School member can delete a fee record through the API (policy `for all`, 0016). The delete trigger posts a contra, so the ledger stays right, but the row is gone | `0016_fee_collection.sql` | A Student delete cascades to fee records, so forbidding it is a wider decision |
| `fee_post_gl_delete` posts a ledger entry with the row's `school_id` while a School is being deleted | `0097_fee_gl_review_fixes.sql` | Not verified; may make a School with paid fee records undeletable. Check on a branch database |
| `capitalSummary` (director capital cards) adds decimals as floats | `web/lib/director-capital.ts` | Existing behaviour; whole-taka amounts are unaffected. The new running-balance column is summed in poisha |
