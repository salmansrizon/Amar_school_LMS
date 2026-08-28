-- 0164_the_sms_pool_is_summed_in_the_database.sql
-- Map #524, found reviewing #529 against #530.
--
-- #530 was caused by folding an unbounded select in the application, where
-- PostgREST silently caps it at 1000 rows. The Super Admin dashboard was doing
-- exactly that to the SMS pool: `sms_pool_ledger.select('delta')` with no range,
-- summed by poolBalance() in TypeScript.
--
-- 297 rows today, so it is right today. It is one busy month from being wrong,
-- and wrong specifically on the number #529 just taught the dashboard to raise an
-- alert about — a truncated sum would fire the "impossible state" banner on a
-- healthy pool, or hide a real one. Fixing #530 and leaving this is fixing the
-- instance and not the class.
create or replace view public.sms_pool_summary as
  select
    coalesce(sum(e.quantity), 0)::int                                as balance,
    coalesce(sum(e.quantity) filter (where e.quantity > 0), 0)::int  as bought,
    coalesce(-sum(e.quantity) filter (where e.quantity < 0), 0)::int as sent
  from public.wallet_ledger_entries e
  join public.wallets w on w.id = e.wallet_id
  where w.wallet_type = 'company_sms'
    and w.owner_school_id is null
    and w.owner_profile_id is null;

comment on view public.sms_pool_summary is
  'One row: the company SMS pool balance, total ever bought and total ever sent. Aggregated in the database so it cannot be truncated by a paginated fetch the way #530 was.';

alter view public.sms_pool_summary set (security_invoker = true);
grant select on public.sms_pool_summary to authenticated;
