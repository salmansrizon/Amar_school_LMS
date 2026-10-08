-- 0231_fee_record_void.sql
-- #683: void a Fee Collection Record instead of editing it away.
--
-- What:
--   1. fee_collection_records.void_at / void_by / void_reason (who, when, why).
--   2. fee_record_void_guard (before insert or update): only the School Owner
--      may void; a reason is required; the void stamps void_at = now() and
--      void_by = auth.uid() itself (the request cannot choose them); a void may
--      change nothing else on the row; a voided row can never be changed or
--      un-voided; a row cannot be created already voided.
--   3. fee_gl_void (after update of void_at): posts the reversing entry to the
--      general ledger in the same transaction, through the same fee_gl_apply
--      (0097) and the same `fee:<record id>:<seq>` ref as every other posting
--      of the record, so the receipt's "ledger impact" lists it.
--   4. fee_post_gl_delete (0097) skips a voided row: its money is already
--      reversed, and deleting it (a Student delete cascades) must not reverse
--      it a second time.
--   5. "One record per Student per month" becomes "one record that is not
--      voided": the unique CONSTRAINT one_record_per_student_month is replaced
--      by the partial unique INDEX one_active_fee_record_per_student_month.
--      Without this a voided month could never be collected again, and "void
--      and re-record" (ADR 0012) would be impossible.
--   6. student_fee_record (0147) leaves voided rows out, so a Student never
--      sees a payment that was reversed. Same columns as before; fee_amount and
--      adjust_amount stay absent (ADR 0015).
-- Why: a wrong collection (wrong Student, wrong month) could only be edited.
--   An edit leaves no record of the mistake or of who undid it.
-- Effect on existing data: NONE. Three nullable columns, no default; no row is
--   updated, deleted or re-dated; every stored amount stays as it is. A void
--   itself changes no amount either: the row keeps pay / fine / adjust / due
--   and its updated_at, and gains only the three void fields.
-- New constraint on existing rows: fee_record_void_has_reason is satisfied by
--   every existing row (all three new columns are NULL). The partial unique
--   index cannot fail: the rows it covers are exactly the rows the old
--   constraint already holds unique.
-- App before / after: lib/fee-columns.ts probes for void_at. Absent: no void
--   control is shown and the void action answers "not available yet". Present:
--   the School Owner can void from the receipt; voided rows are listed as
--   voided and left out of every total.
--
-- !! ON CONFLICT: after this migration `insert ... on conflict (student_id,
--   month, year)` has no constraint to match and fails (42P10). The two callers
--   in this repository were changed in the same commit so they work before and
--   after: supabase/staging-seed.sql and tests/integration/staff-screen-grants.test.ts.
--   Check other branches (grep "student_id, month, year" / "student_id,month,year")
--   before applying.
--
-- PRE-CHECK (read-only; run before applying):
--   -- a. the old constraint is there and holds (expect 1 row, then 0 rows)
--   select conname from pg_constraint
--    where conrelid = 'public.fee_collection_records'::regclass
--      and conname = 'one_record_per_student_month';
--   select student_id, month, year, count(*) from public.fee_collection_records
--    group by 1, 2, 3 having count(*) > 1;
--   -- b. the two objects this file replaces are still as 0097 / 0147 wrote
--   --    them (compare with the rollback text below)
--   select pg_get_functiondef('public.fee_post_gl_delete()'::regprocedure);
--   select pg_get_viewdef('public.student_fee_record'::regclass, true);
--   -- c. trigger names: fee_record_void_guard must sort AFTER fee_record_touch
--   --    (before-triggers fire in name order; the guard restores updated_at)
--   select tgname from pg_trigger
--    where tgrelid = 'public.fee_collection_records'::regclass and not tgisinternal
--    order by tgname;
--   -- d. none of the new names is taken (expect 0 rows)
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'fee_collection_records'
--      and column_name in ('void_at', 'void_by', 'void_reason');
--
-- POST-CHECK (read-only):
--   select count(*) as voided from public.fee_collection_records where void_at is not null;  -- expect 0
--   select indexdef from pg_indexes where indexname = 'one_active_fee_record_per_student_month';
--
-- Rollback. ONLY while both of these return nothing — otherwise stop: a voided
--   row would come back to life with its ledger entry already reversed, or the
--   old constraint could not be restored without deleting a financial row.
--     select id from public.fee_collection_records where void_at is not null limit 1;
--     select student_id, month, year from public.fee_collection_records
--      group by 1, 2, 3 having count(*) > 1 limit 1;
--   Then, in this order (the function and the view name void_at, so they go
--   back first; the constraint is restored before its replacement is dropped):
--     drop trigger if exists fee_gl_void on public.fee_collection_records;
--     drop trigger if exists fee_record_void_guard on public.fee_collection_records;
--     create or replace function public.fee_post_gl_delete() returns trigger
--       language plpgsql security definer set search_path = public as $$
--     declare cash_acct text;
--     begin
--       cash_acct := case when old.payment_method = 'cash' then '1000' else '1050' end;
--       perform public.fee_gl_apply(old.id, old.school_id,
--         'Fee reversal ' || old.month || '/' || old.year,
--         -round(old.pay_amount * 100)::bigint, -round(old.fine_amount * 100)::bigint, cash_acct);
--       return old;
--     end;
--     $$;
--     create or replace view public.student_fee_record with (security_invoker = off, security_barrier = true) as
--       select f.id, f.month, f.year, f.pay_amount, f.fine_amount, f.due_amount, f.payment_method, f.updated_at
--         from public.fee_collection_records f
--         join public.students me
--           on me.id = f.student_id and me.profile_id = auth.uid() and me.archived_at is null;
--     alter table public.fee_collection_records
--       add constraint one_record_per_student_month unique (student_id, month, year);
--     drop index if exists public.one_active_fee_record_per_student_month;
--     alter table public.fee_collection_records drop constraint if exists fee_record_void_has_reason;
--     drop function if exists public.fee_post_gl_void();
--     drop function if exists public.fee_record_void_guard();
--     alter table public.fee_collection_records
--       drop column if exists void_reason, drop column if exists void_by, drop column if exists void_at;
--     notify pgrst, 'reload schema';
-- Idempotent.

-- 1. Who, when, why -----------------------------------------------------------

alter table public.fee_collection_records
  add column if not exists void_at timestamptz,
  add column if not exists void_by uuid references public.profiles (id) on delete set null,
  add column if not exists void_reason text;

comment on column public.fee_collection_records.void_at is
  'When the record was voided (#683). NULL = active. Set only by fee_record_void_guard; a voided row is immutable.';

-- void_by may go NULL later (the profile is deleted), so it is not part of the
-- rule; the reason is.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.fee_collection_records'::regclass
       and conname = 'fee_record_void_has_reason'
  ) then
    alter table public.fee_collection_records
      add constraint fee_record_void_has_reason check (
        (void_at is null and void_reason is null and void_by is null)
        or (void_at is not null and char_length(btrim(void_reason)) between 1 and 500)
      );
  end if;
end $$;

-- 2. One ACTIVE record per Student per month ----------------------------------
-- The index goes in before the constraint goes out, so uniqueness is never
-- unenforced, not even inside this transaction.

create unique index if not exists one_active_fee_record_per_student_month
  on public.fee_collection_records (student_id, month, year)
  where void_at is null;

alter table public.fee_collection_records
  drop constraint if exists one_record_per_student_month;

-- 3. The void rules -----------------------------------------------------------
-- Security invoker: it only reads auth.uid() and app_current_role(), and both
-- answer for the caller. Fires after fee_record_touch (name order), which has
-- already set updated_at = now(); a void puts the old value back, because the
-- ledger page and the receipt date the payment by updated_at and the void has
-- its own date.

create or replace function public.fee_record_void_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  untouched constant text[] := array['void_at', 'void_by', 'void_reason', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    if new.void_at is not null or new.void_by is not null or new.void_reason is not null then
      raise exception 'a fee record cannot be created voided';
    end if;
    return new;
  end if;

  if old.void_at is not null then
    raise exception 'a voided fee record cannot be changed';
  end if;

  if new.void_at is null then
    -- Not a void: the void fields stay empty.
    if new.void_by is not null or new.void_reason is not null then
      raise exception 'void_by and void_reason are set only by voiding the record';
    end if;
    return new;
  end if;

  if coalesce(public.app_current_role()::text, '') <> 'school_owner' then
    raise exception 'only the School Owner can void a fee record';
  end if;
  new.void_reason := btrim(new.void_reason);
  if new.void_reason is null or new.void_reason = '' then
    raise exception 'a void needs a reason';
  end if;
  if (to_jsonb(new) - untouched) is distinct from (to_jsonb(old) - untouched) then
    raise exception 'a void cannot change any other field of the fee record';
  end if;

  new.void_at := now();
  new.void_by := auth.uid();
  new.updated_at := old.updated_at;
  return new;
end $$;

drop trigger if exists fee_record_void_guard on public.fee_collection_records;
create trigger fee_record_void_guard
  before insert or update on public.fee_collection_records
  for each row execute function public.fee_record_void_guard();

-- 4. The reversing ledger entry ----------------------------------------------
-- Mirrors fee_post_gl_delete (0097): the record's whole pay and fine, negated,
-- against the cash account its payment method maps to. fee_gl_apply skips a
-- record with no money on it.

create or replace function public.fee_post_gl_void() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.fee_gl_apply(new.id, new.school_id,
    'Fee void ' || new.month || '/' || new.year,
    -round(new.pay_amount * 100)::bigint, -round(new.fine_amount * 100)::bigint,
    case when new.payment_method = 'cash' then '1000' else '1050' end);
  return new;
end;
$$;

drop trigger if exists fee_gl_void on public.fee_collection_records;
create trigger fee_gl_void
  after update of void_at on public.fee_collection_records
  for each row when (old.void_at is null and new.void_at is not null)
  execute function public.fee_post_gl_void();

-- Deleting a voided row must not reverse it again. Body as in 0097 plus the
-- one guard.
create or replace function public.fee_post_gl_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
declare cash_acct text;
begin
  if old.void_at is not null then return old; end if;
  cash_acct := case when old.payment_method = 'cash' then '1000' else '1050' end;
  perform public.fee_gl_apply(old.id, old.school_id,
    'Fee reversal ' || old.month || '/' || old.year,
    -round(old.pay_amount * 100)::bigint, -round(old.fine_amount * 100)::bigint, cash_acct);
  return old;
end;
$$;

-- Trigger functions need no EXECUTE for anyone (0150): the trigger mechanism
-- does not check it. Only the two NEW functions are closed here;
-- fee_post_gl_delete keeps whatever grants it had (`create or replace` does
-- not touch them).
revoke execute on function public.fee_record_void_guard() from public, anon, authenticated;
revoke execute on function public.fee_post_gl_void() from public, anon, authenticated;

-- 5. A Student never sees a voided record -------------------------------------
-- Same column list as 0147, so `create or replace` keeps the view's grants.

create or replace view public.student_fee_record with (security_invoker = off, security_barrier = true) as
  select f.id,
         f.month,
         f.year,
         f.pay_amount,
         f.fine_amount,
         f.due_amount,
         f.payment_method,
         f.updated_at
    from public.fee_collection_records f
    join public.students me
      on me.id = f.student_id
     and me.profile_id = auth.uid()
     and me.archived_at is null
   where f.void_at is null;

grant select on public.student_fee_record to authenticated;

notify pgrst, 'reload schema';
