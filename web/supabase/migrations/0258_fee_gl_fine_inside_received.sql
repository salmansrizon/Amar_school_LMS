-- 0258_fee_gl_fine_inside_received.sql
-- #707: the general ledger counted the fine twice.
--
-- OWNER'S DECISION: fee_collection_records.pay_amount (the "received" amount)
--   INCLUDES the fine. Fee 100, fine 10, received 110 means 110 was paid in
--   all. The collection form already works that way (payable = fee + fine -
--   adjustment, due = payable - received). The ledger did not: 0097 debited
--   cash by pay_amount + fine_amount (received 60 with a fine of 10 put 70
--   into cash).
--
-- Requires 0230 (fee_amount) and 0231 (void_at) to be applied. The first
--   statement below stops the file if either column is missing.
--
-- What:
--   1. THE RULE, in one place (fee_gl_fine_part) and used by every posting:
--        cash (1000 / 1050)  debit   pay_amount
--        fine income (4400)  credit  least(fine_amount, pay_amount)
--        fee income  (4300)  credit  pay_amount - that
--      The fine is taken out of the money first. Conservative on purpose:
--      nothing is ever credited that was not received, and a partial payment
--      never shows fee income while its fine is unpaid.
--        fee 100, fine 10, received  60 -> cash  60 = fine 10 + fee  50
--        fee 100, fine 10, received 110 -> cash 110 = fine 10 + fee 100
--        fee 100, fine 10, received 130 -> cash 130 = fine 10 + fee 120
--          (the advance of 20 stays in fee income; the ledger has no advance
--           account, as before)
--        fee 100, fine 10, received   0 -> nothing is posted
--        fee 100, fine 10, received   6 -> cash   6 = fine  6
--   2. fee_post_gl (insert / update): posts the DELTA between the old and the
--      new figures, both split by the rule above. Insert is the delta from
--      nothing. So cash always moves by exactly the change in pay_amount; a
--      change of the fine alone moves money between 4300 and 4400 and leaves
--      cash alone.
--   3. fee_gl_apply: unchanged except that a zero cash leg is skipped. A
--      fine-only edit now has no cash movement, and gl_lines refuses a line
--      with neither side (gl_line_one_side, 0085): without this the edit
--      itself would fail.
--   4. fee_post_gl_void and fee_post_gl_delete: reverse what the ledger
--      ACTUALLY HOLDS for the record (fee_gl_reverse: the net of every
--      `fee:<record id>:%` entry, per account, negated), not a figure worked
--      out again from the row. A void or a delete therefore nets the record to
--      zero whichever rule its entries were posted under, and whichever cash
--      account (1000 / 1050) each of them went to.
--   5. student_fee_record gains a ninth column, advance_amount: the part of
--      pay_amount beyond the month's bill (0 when fee_amount is not stored).
--      The Student fee page works the bill out as pay + due, which showed an
--      advance as payable ("Payable 130" for a month billed 110). The page
--      reads the view with select('*') and treats the column as optional.
--      ADR 0015 holds: fee_amount and adjust_amount stay absent, and the
--      figure this makes visible (bill net of the adjustment) is the one the
--      page already shows for every month that is not overpaid.
--
-- Why: see the decision above. Cash, fee income and the receipt total were
--   overstated by the fine on every record that carries one.
--
-- Effect on existing data: NONE. No row of any table is inserted, updated or
--   deleted by this file; no existing ledger entry is rewritten or corrected.
--   Functions and one view are replaced; two functions are added.
--
-- RECORDS POSTED UNDER THE OLD RULE (before this file is applied):
--   Their entries stay as they are: cash is overstated by the fine the record
--   carried (and income with it). After this file:
--   * EDIT. The delta is worked out with the new rule on both sides, so the
--     edit itself is right (cash moves by the change in pay_amount), and the
--     old overstatement stays exactly as large as it was at cut-over. It
--     neither grows nor shrinks. The record is NOT silently corrected.
--   * VOID or DELETE. The reversal is taken from the ledger, so it removes
--     everything the record ever posted, the overstatement included. The
--     record nets to zero. (With a reversal computed from the row under the new
--     rule it would not: the fine would be left in cash for good. That is why
--     step 4 reads the ledger.)
--   * No marker column and no cut-off date is needed for this: the ledger
--     itself says what was posted. Nothing has to be written to existing rows.
--   * Correcting the overstatement that is already in the books is the
--     accountant's decision and is NOT done here. The list is in
--     docs/handoff/migrations-fees-rollout.md. If a correcting entry is posted
--     per record, give it the ref `fee:<record id>:fix`: step 4 then sees it,
--     and a later void still nets to zero. A correction under any other ref is
--     invisible to step 4 and a later void of that record would take the
--     overstatement out a second time.
--
-- Left as it is (not part of #707): an edit posts its delta to the cash
--   account of the record's CURRENT payment method, and a change of the
--   payment method alone posts nothing (the trigger fires on pay_amount and
--   fine_amount only). Void and delete are no longer affected by this, because
--   they reverse each account where the money actually sits.
--
-- PRE-CHECK (read-only; run before applying):
--   -- a. how many records carry a fine, and how much, per school
--   select f.school_id, s.name,
--          count(*)                                  as records_with_fine,
--          sum(f.fine_amount)                        as fine_total,
--          count(*) filter (where f.void_at is null) as of_which_active,
--          sum(f.fine_amount) filter (where f.void_at is null) as fine_total_active
--     from public.fee_collection_records f
--     join public.schools s on s.id = f.school_id
--    where f.fine_amount > 0
--    group by f.school_id, s.name
--    order by fine_total desc;
--   -- b. the difference the old rule left in the ledger, per school: cash the
--   --    ledger holds for a record minus what the record says was received.
--   --    Rule-free, so it reads the same before and after applying.
--   with standing as (
--     select split_part(e.ref, ':', 2) as record_id,
--            sum(l.debit - l.credit) filter (where l.account_code in ('1000', '1050')) as cash_poisha
--       from public.gl_entries e
--       join public.gl_lines l on l.entry_id = e.id
--      where e.ref like 'fee:%'
--      group by 1
--   )
--   select f.school_id,
--          count(*) as records_off,
--          sum(coalesce(st.cash_poisha, 0) - round(f.pay_amount * 100)) / 100.0 as cash_overstated_taka
--     from public.fee_collection_records f
--     join standing st on st.record_id = f.id::text
--    where f.void_at is null
--      and coalesce(st.cash_poisha, 0) <> round(f.pay_amount * 100)
--    group by f.school_id;
--   -- c. the objects this file replaces are still as 0097 / 0231 wrote them
--   --    (compare with the rollback text below)
--   select pg_get_functiondef(p.oid) from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('fee_gl_apply', 'fee_post_gl', 'fee_post_gl_void', 'fee_post_gl_delete');
--   select pg_get_viewdef('public.student_fee_record'::regclass, true);
--   -- d. the two new names are free (expect 0 rows)
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace and proname in ('fee_gl_fine_part', 'fee_gl_reverse');
--
-- POST-CHECK (read-only):
--   select public.fee_gl_fine_part(60, 10)  as expect_1000,   -- poisha
--          public.fee_gl_fine_part(6, 10)   as expect_600,
--          public.fee_gl_fine_part(0, 10)   as expect_0;      -- run as postgres: EXECUTE is revoked
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'student_fee_record'
--    order by ordinal_position;                                -- 9 columns, advance_amount last
--   -- query b above returns the same rows as before applying
--
-- Rollback. Restores the 0097 / 0231 text exactly. Know before using it: every
--   record saved while this file was live is posted with the fine inside the
--   received amount, and the old void / delete below reverse pay + fine. Such a
--   record would then be over-reversed by its fine. Steps 3 and 4 below are
--   therefore optional: fee_gl_reverse is right under either rule and may be
--   kept.
--     -- 1. posting rule (0097)
--     create or replace function public.fee_gl_apply(
--       p_id uuid, p_school uuid, p_memo text, pp bigint, ff bigint, cash_acct text
--     ) returns void language plpgsql security definer set search_path = public as $$
--     declare lines jsonb := '[]'::jsonb;
--     begin
--       if pp = 0 and ff = 0 then return; end if;
--       if pp <> 0 then lines := lines || public.gl_line('4300', pp); end if;
--       if ff <> 0 then lines := lines || public.gl_line('4400', ff); end if;
--       lines := lines || public.gl_line(cash_acct, -(pp + ff)); -- cash offsets income
--       perform public.gl_post_system('fee:' || p_id || ':' || nextval('public.fee_gl_seq'), p_memo, lines, p_school);
--     end;
--     $$;
--     -- 2. insert / update (0097)
--     create or replace function public.fee_post_gl() returns trigger
--       language plpgsql security definer set search_path = public as $$
--     declare pp bigint; ff bigint; cash_acct text;
--     begin
--       pp := round((new.pay_amount - coalesce(old.pay_amount, 0)) * 100)::bigint;
--       ff := round((new.fine_amount - coalesce(old.fine_amount, 0)) * 100)::bigint;
--       cash_acct := case when new.payment_method = 'cash' then '1000' else '1050' end;
--       perform public.fee_gl_apply(new.id, new.school_id,
--         'Fee ' || new.month || '/' || new.year, pp, ff, cash_acct);
--       return new;
--     end;
--     $$;
--     -- 3. void (0231)   [optional, see above]
--     create or replace function public.fee_post_gl_void() returns trigger
--       language plpgsql security definer set search_path = public as $$
--     begin
--       perform public.fee_gl_apply(new.id, new.school_id,
--         'Fee void ' || new.month || '/' || new.year,
--         -round(new.pay_amount * 100)::bigint, -round(new.fine_amount * 100)::bigint,
--         case when new.payment_method = 'cash' then '1000' else '1050' end);
--       return new;
--     end;
--     $$;
--     -- 4. delete (0231)   [optional, see above]
--     create or replace function public.fee_post_gl_delete() returns trigger
--       language plpgsql security definer set search_path = public as $$
--     declare cash_acct text;
--     begin
--       if old.void_at is not null then return old; end if;
--       cash_acct := case when old.payment_method = 'cash' then '1000' else '1050' end;
--       perform public.fee_gl_apply(old.id, old.school_id,
--         'Fee reversal ' || old.month || '/' || old.year,
--         -round(old.pay_amount * 100)::bigint, -round(old.fine_amount * 100)::bigint, cash_acct);
--       return old;
--     end;
--     $$;
--     -- 5. the view (0231). A column cannot be removed with `create or
--     --    replace`, so it is dropped and created again, and the grant with it.
--     drop view if exists public.student_fee_record;
--     create view public.student_fee_record with (security_invoker = off, security_barrier = true) as
--       select f.id, f.month, f.year, f.pay_amount, f.fine_amount, f.due_amount, f.payment_method, f.updated_at
--         from public.fee_collection_records f
--         join public.students me
--           on me.id = f.student_id and me.profile_id = auth.uid() and me.archived_at is null
--        where f.void_at is null;
--     grant select on public.student_fee_record to authenticated;
--     -- 6. the new functions (fee_gl_reverse only if steps 3 and 4 were run)
--     drop function if exists public.fee_gl_fine_part(numeric, numeric);
--     drop function if exists public.fee_gl_reverse(uuid, uuid, text);
--     notify pgrst, 'reload schema';
-- Idempotent.

-- 0. Stop unless 0230 and 0231 are applied ------------------------------------

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'fee_collection_records'
         and column_name in ('fee_amount', 'void_at')) <> 2 then
    raise exception '0258 needs 0230 (fee_amount) and 0231 (void_at) applied first';
  end if;
end $$;

-- 1. The rule ------------------------------------------------------------------
-- The fine part of a received amount, in poisha. The fee part is the rest.

create or replace function public.fee_gl_fine_part(p_pay numeric, p_fine numeric)
  returns bigint language sql immutable set search_path = public as $$
  select greatest(least(round(p_fine * 100), round(p_pay * 100)), 0)::bigint;
$$;

-- 2. fee_gl_apply: as 0097, minus a cash leg of zero ---------------------------

create or replace function public.fee_gl_apply(
  p_id uuid, p_school uuid, p_memo text, pp bigint, ff bigint, cash_acct text
) returns void language plpgsql security definer set search_path = public as $$
declare lines jsonb := '[]'::jsonb;
begin
  if pp = 0 and ff = 0 then return; end if;
  if pp <> 0 then lines := lines || public.gl_line('4300', pp); end if;
  if ff <> 0 then lines := lines || public.gl_line('4400', ff); end if;
  if pp + ff <> 0 then lines := lines || public.gl_line(cash_acct, -(pp + ff)); end if; -- cash offsets income
  perform public.gl_post_system('fee:' || p_id || ':' || nextval('public.fee_gl_seq'), p_memo, lines, p_school);
end;
$$;

-- 3. Insert / update: the delta between two states, both split by the rule ----
-- pp + ff = the change in pay_amount, so that is what cash moves by.

create or replace function public.fee_post_gl() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  pay_new bigint := round(new.pay_amount * 100)::bigint;
  fine_new bigint := public.fee_gl_fine_part(new.pay_amount, new.fine_amount);
  pay_old bigint := 0;
  fine_old bigint := 0;
begin
  if tg_op = 'UPDATE' then
    pay_old := round(old.pay_amount * 100)::bigint;
    fine_old := public.fee_gl_fine_part(old.pay_amount, old.fine_amount);
  end if;
  perform public.fee_gl_apply(new.id, new.school_id,
    'Fee ' || new.month || '/' || new.year,
    (pay_new - fine_new) - (pay_old - fine_old), fine_new - fine_old,
    case when new.payment_method = 'cash' then '1000' else '1050' end);
  return new;
end;
$$;

-- 4. Void / delete: reverse what the ledger holds for the record ---------------
-- Every entry of a record is balanced, so the negated per-account nets are
-- balanced too. Nothing held (never posted, or already netted out): no entry.
-- A uuid has no LIKE wildcard in it, and the closing colon stops one id
-- matching as the prefix of another ref (lib/fees.ts feeGlRefPattern).
-- ponytail: `ref like` scans gl_entries (the unique index on ref is not a
-- pattern index); voids and deletes are rare. Add a text_pattern_ops index on
-- gl_entries(ref) if a class-wide delete ever gets slow.

create or replace function public.fee_gl_reverse(p_id uuid, p_school uuid, p_memo text)
  returns void language plpgsql security definer set search_path = public as $$
declare lines jsonb;
begin
  select jsonb_agg(public.gl_line(held.account_code, -held.net))
    into lines
    from (select l.account_code, sum(l.credit - l.debit)::bigint as net
            from public.gl_entries e
            join public.gl_lines l on l.entry_id = e.id
           where e.ref like 'fee:' || p_id || ':%'
           group by l.account_code
          having sum(l.credit - l.debit) <> 0) held;
  if lines is null then return; end if;
  perform public.gl_post_system('fee:' || p_id || ':' || nextval('public.fee_gl_seq'), p_memo, lines, p_school);
end;
$$;

create or replace function public.fee_post_gl_void() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.fee_gl_reverse(new.id, new.school_id, 'Fee void ' || new.month || '/' || new.year);
  return new;
end;
$$;

-- Deleting a voided row must not reverse it again (0231). Its net is already
-- zero, so fee_gl_reverse would post nothing either way; the guard stays so
-- the intent is written down.
create or replace function public.fee_post_gl_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.void_at is not null then return old; end if;
  perform public.fee_gl_reverse(old.id, old.school_id, 'Fee reversal ' || old.month || '/' || old.year);
  return old;
end;
$$;

-- Only the two NEW functions are closed here (0150: nothing in the app calls
-- them, and a trigger needs no EXECUTE). The replaced ones keep the grants
-- they had: `create or replace` does not touch them.
revoke execute on function public.fee_gl_fine_part(numeric, numeric) from public, anon, authenticated;
revoke execute on function public.fee_gl_reverse(uuid, uuid, text) from public, anon, authenticated;

-- 5. The Student's view: the advance, so it is not shown as payable ------------
-- The eight columns of 0231 in the same order, one appended: `create or
-- replace` keeps the view's grants. Same arithmetic as lib/fees.ts
-- advanceAmount: received beyond fee + fine - adjustment, 0 when the fee is
-- not stored (an advance is then indistinguishable from an exact payment).

create or replace view public.student_fee_record with (security_invoker = off, security_barrier = true) as
  select f.id,
         f.month,
         f.year,
         f.pay_amount,
         f.fine_amount,
         f.due_amount,
         f.payment_method,
         f.updated_at,
         case when f.fee_amount is null then 0
              else greatest(f.pay_amount - greatest(f.fee_amount + f.fine_amount - f.adjust_amount, 0), 0)
         end::numeric(12, 2) as advance_amount
    from public.fee_collection_records f
    join public.students me
      on me.id = f.student_id
     and me.profile_id = auth.uid()
     and me.archived_at is null
   where f.void_at is null;

grant select on public.student_fee_record to authenticated;

notify pgrst, 'reload schema';
