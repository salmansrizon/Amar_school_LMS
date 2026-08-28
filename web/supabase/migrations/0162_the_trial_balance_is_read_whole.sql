-- 0162_the_trial_balance_is_read_whole.sql
-- Map #524 / ticket #530: /super-admin/accounting reported
-- `Ledger out of balance by ৳2,800.00`, and the UAT report made it release
-- blocker number two — "financial reports, settlements, and customer billing
-- cannot be signed off".
--
-- The ledger was never out of balance. In the database, gl_lines sums to
-- 5,147,442,593 debit against 5,147,442,593 credit across 46,521 lines: a
-- difference of exactly zero.
--
-- The page fetched `gl_lines` with no range, and PostgREST caps an unbounded
-- select at 1000 rows. So it summed the first 1,000 of 46,521 lines and reported
-- the difference of that arbitrary prefix. That prefix differs by exactly 280,000
-- paisa — ৳2,800.00, the reported figure, reproduced to the paisa.
--
-- The lesson is bigger than the number: a trial balance computed in the
-- application over a paginated fetch will *always* be wrong, and wrong in a way
-- that looks exactly like fraud. It is an aggregate and it belongs in the
-- database, where it cannot be silently truncated.

-- ---------------------------------------------------------------------------
-- 1. The trial balance as an aggregate, not a download.
--
-- 15 accounts out of 46,521 lines. The page was moving four thousand times more
-- data than it displayed, and losing correctness in exchange.
create or replace view public.gl_trial_balance as
  select
    l.account_code,
    sum(l.debit)::bigint  as debit,
    sum(l.credit)::bigint as credit
  from public.gl_lines l
  group by l.account_code;

comment on view public.gl_trial_balance is
  'Per-account debit/credit totals over the whole ledger. Ticket #530: the page previously summed gl_lines in the app, where PostgREST truncated it to 1000 rows and produced a phantom ৳2,800 imbalance.';

-- security_invoker = true is load-bearing, not decoration: it makes gl_lines' own
-- RLS apply to whoever queries the view. `read visible gl_lines` gates on
-- gl_entry_visible -> app_tenant_member, and vendor-level entries carry a null
-- school_id, so a School Owner sees only their own school's totals through this
-- view and a Student or Distributor sees nothing. Without it the view would run
-- as its definer and hand every authenticated caller the vendor ledger. Do not
-- flip it off.
alter view public.gl_trial_balance set (security_invoker = true);
grant select on public.gl_trial_balance to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Balanced-or-not as one authoritative answer.
--
-- Computed over the whole table by definition, so it cannot be fooled the way the
-- page was. Callers that need to *block* on it — settlement below — must use this
-- rather than re-deriving the sum, which is how the first wrong answer happened.
create or replace function public.gl_is_balanced()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) from public.gl_lines
$$;

comment on function public.gl_is_balanced() is
  'True when the whole general ledger balances. The authority for any financial gate — never re-derive this from a fetched page of gl_lines (#530).';

-- ---------------------------------------------------------------------------
-- 3. Settlement refuses to run against a broken ledger.
--
-- The gate belongs here and not in the UI: settlement_approve flips a settlement
-- to paid, settles its commissions, posts to the GL and publishes a domain event.
-- A disabled button is a courtesy; this is the boundary.
--
-- Checked before anything is written, so a refusal leaves no partial state. The
-- ledger is balanced today, so this changes no current behaviour — it is the
-- thing that makes the reported blocker genuinely impossible rather than merely
-- absent.
create or replace function public.settlement_approve(p_settlement uuid, job_secret text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.settlements;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;

  -- Ticket #530: no money moves while debits and credits disagree.
  if not public.gl_is_balanced() then
    raise exception 'general ledger is out of balance — settlement refused until it is reconciled'
      using errcode = 'check_violation';
  end if;

  select * into s from public.settlements where id = p_settlement for update;
  if not found then raise exception 'settlement not found'; end if;
  if s.status <> 'draft' then raise exception 'settlement is not draft'; end if;
  update public.settlements set status = 'paid', approved_by = auth.uid(), approved_at = now() where id = p_settlement;
  update public.commissions set status = 'settled' where settlement_id = p_settlement;
  if s.total_amount > 0 then
    perform public.gl_post('settlement:' || p_settlement, 'Distributor settlement',
      jsonb_build_array(
        jsonb_build_object('account_code', '2100', 'debit', s.total_amount, 'credit', 0),
        jsonb_build_object('account_code', '1000', 'debit', 0, 'credit', s.total_amount)
      ), null, job_secret);
  end if;
  perform public.publish_domain_event('SettlementCompleted', null,
    jsonb_build_object('settlementId', p_settlement, 'distributor', s.distributor_id, 'amount', s.total_amount), null, job_secret);
  perform public.record_audit('settlement', p_settlement::text, 'approve', null, null, null,
    jsonb_build_object('amount', s.total_amount), null, null, null, job_secret);
end;
$$;
