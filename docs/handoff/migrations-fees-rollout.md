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
