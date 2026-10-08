-- 0232_director_capital_guard.sql
-- #681: stop the director capital balance drifting away from its transactions.
--
-- Cause (found on merge/staging-sync): director_capital_balances.balance is a
--   running total kept by apply_director_capital_transaction (0055), a BEFORE
--   INSERT trigger. Nothing ran on DELETE or UPDATE, so deleting a transaction
--   left its amount in the balance — and its entry in the general ledger
--   (director_capital_post_gl, 0098, is insert-only too). An integration test
--   deleted its own rows as the School Owner on the shared database on every
--   run; Test School A's stored balance is ৳13,14,000 above what its
--   transactions add up to.
-- What: one trigger, director_capital_transaction_guard (before update or
--   delete), running director_capital_guard():
--   * UPDATE: amount, txn_type, school_id and balance_after cannot change, for
--     any caller. txn_date and note can.
--   * DELETE by a signed-in School member (owner or staff): refused. A wrong
--     transaction is corrected by recording the opposite one.
--   * DELETE by anyone else — the SQL editor, the service role, a Super Admin,
--     i.e. deliberate operations work — is allowed and REVERSES the row: the
--     balance moves back by the row's amount and a contra entry
--     `dircap:<id>:reversal` is posted to the general ledger. The balance can
--     no longer drift whoever deletes.
--   * DELETE because the School itself is being deleted (cascade): nothing to
--     keep straight, the row just goes.
-- Effect on existing data: NONE. No balance, no transaction and no ledger entry
--   is changed by applying this file. In particular it does NOT correct Test
--   School A's existing ৳13,14,000 difference: that needs the owner's decision
--   (recompute the balance, or record it as an opening entry) and is not
--   written anywhere in this branch. The read-only query below shows it.
-- Note for the test-data cleanup (#686): once this is applied, deleting test
--   capital rows from the SQL editor lowers the stored balance by their amount
--   and posts contra entries. That is the intended, correct effect.
-- App before / after: the app never updates or deletes these rows (it only
--   inserts), so nothing changes for it either way.
--
-- PRE-CHECK (read-only; run before applying, keep the output):
--   -- a. stored balance against the transactions, per School. A row here is a
--   --    School whose balance its transactions do not explain.
--   select b.school_id, s.name,
--          b.balance                          as stored_balance,
--          coalesce(t.net, 0)                 as net_of_transactions,
--          b.balance - coalesce(t.net, 0)     as unexplained,
--          coalesce(t.txns, 0)                as transactions
--     from public.director_capital_balances b
--     join public.schools s on s.id = b.school_id
--     left join (
--       select school_id,
--              sum(case when txn_type = 'invest' then amount else -amount end) as net,
--              count(*) as txns
--         from public.director_capital_transactions group by school_id
--     ) t on t.school_id = b.school_id
--    where b.balance <> coalesce(t.net, 0);
--   -- b. the same account in the general ledger (taka), for comparison
--   select e.school_id, sum(l.credit - l.debit) / 100.0 as gl_director_capital
--     from public.gl_lines l join public.gl_entries e on e.id = l.entry_id
--    where l.account_code = '3000' group by e.school_id;
--   -- c. the trigger name is free (expect 0 rows)
--   select tgname from pg_trigger
--    where tgrelid = 'public.director_capital_transactions'::regclass
--      and tgname = 'director_capital_transaction_guard';
--
-- POST-CHECK (read-only): query (a) must return exactly what it returned before.
--
-- Rollback:
--   drop trigger if exists director_capital_transaction_guard on public.director_capital_transactions;
--   drop function if exists public.director_capital_guard();
--   notify pgrst, 'reload schema';
-- Idempotent.

-- Definer: a School member has no write policy on director_capital_balances
-- (0055 gives select only), and the ledger is written through gl_post_system.
create or replace function public.director_capital_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  signed numeric(12, 2);
  poisha bigint;
begin
  if tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount
       or new.txn_type is distinct from old.txn_type
       or new.school_id is distinct from old.school_id
       or new.balance_after is distinct from old.balance_after then
      raise exception 'a director capital transaction cannot be changed; record a reversing transaction instead';
    end if;
    return new;
  end if;

  -- The School is being deleted and this row goes with it: the cascade runs
  -- after the School row is gone, so there is no balance or ledger to adjust.
  if not exists (select 1 from schools where id = old.school_id) then
    return old;
  end if;

  if auth.uid() is not null and coalesce(app_current_role()::text, '') <> 'super_admin' then
    raise exception 'a director capital transaction cannot be deleted; record a reversing transaction instead';
  end if;

  -- An operations delete: take the row's effect back out of the balance and
  -- post the contra of director_capital_post_gl (0098).
  signed := case when old.txn_type = 'invest' then old.amount else -old.amount end;
  update director_capital_balances set balance = balance - signed where school_id = old.school_id;
  poisha := round(signed * 100)::bigint;
  perform gl_post_system('dircap:' || old.id || ':reversal', 'Director capital reversal ' || old.txn_type,
    jsonb_build_array(gl_line('1000', poisha), gl_line('3000', -poisha)), old.school_id);
  return old;
end $$;

-- A trigger function needs no EXECUTE for anyone (0150).
revoke execute on function public.director_capital_guard() from public, anon, authenticated;

drop trigger if exists director_capital_transaction_guard on public.director_capital_transactions;
create trigger director_capital_transaction_guard
  before update or delete on public.director_capital_transactions
  for each row execute function public.director_capital_guard();

notify pgrst, 'reload schema';
