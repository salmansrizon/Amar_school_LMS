-- 0161_the_sms_pool_cannot_go_negative.sql
-- Map #524 / ticket #529: the master SMS pool showed -981 and the Super Admin
-- dashboard rendered it as an ordinary KPI while also saying the pool was empty.
--
-- What actually happened, from the ledger: 297 rows, every one of them
-- `reason = 'send'`, and not a single 'buy' in the table's history. The pool is a
-- gateway-inventory model — bought minus sent — and allocating credits to a
-- school deliberately does not touch it (allocation grants school credit; the
-- pool mirrors real consumption). So 981 segments went out against a pool nobody
-- had ever topped up, and nothing anywhere objected.
--
-- The gap is in the GATE, not in the record. `sms_can_send` is already called
-- before dispatch by both send paths (app/school/sms/actions.ts and
-- app/api/sms/absence/route.ts), and `sms_record_debit` is called after. But
-- sms_can_send only ever asked whether the SCHOOL had credit; it never asked
-- whether the company had any inventory at the gateway to spend.
--
-- Deliberately NOT a constraint on the debit. The ticket asks for something that
-- "refuses any allocation or send taking the pool below zero", and putting that
-- on sms_record_debit would be wrong: that function runs AFTER the message has
-- been handed to the gateway, so refusing there would drop the accounting for a
-- message the recipient has already received. A wallet that disagrees with
-- reality is worse than a wallet that goes negative. Guard the gate; record
-- faithfully.

-- ---------------------------------------------------------------------------
-- 1. The gate now asks about the pool too.
--
-- The pool term is outside the metering check on purpose. Per-school metering is
-- a commercial switch — a school on an unmetered plan still sends real messages
-- through the real gateway, and those still cost real inventory. No inventory,
-- no send, whatever the plan says.
create or replace function public.sms_can_send(sid uuid, segs integer, job_secret text default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sms_authorized_for(sid, job_secret) then
    raise exception 'not authorized for this school';
  end if;

  -- Company inventory at the gateway. Applies to every school, metered or not.
  if public.sms_pool_balance() < segs then
    return false;
  end if;

  return (not public.sms_metering_enforced(sid)) or public.sms_balance(sid) >= segs;
end;
$$;

comment on function public.sms_can_send(uuid, integer, text) is
  'Pre-dispatch gate: the school must have credit (when metered) AND the company pool must hold the segments. Ticket #529 — the pool term is what stops the master pool going negative, and it is checked before the gateway is called, never after.';

-- ---------------------------------------------------------------------------
-- 2. Reconcile the -981.
--
-- These are 297 staging test sends against a pool that was never stocked, not a
-- debt anyone owes. Correcting them by recording the purchase that should have
-- existed would invent a payment; instead this is an explicit adjustment at zero
-- cost, which leaves `bought` honest (still zero ever bought) while returning the
-- balance to zero.
--
-- Guarded by the current balance so re-running this migration cannot double-apply
-- it, and so it does nothing at all on an environment that was already square.
do $$
declare cwid uuid; bal int;
begin
  select public.sms_pool_balance() into bal;
  if bal >= 0 then return; end if;

  select id into cwid from public.wallets
   where wallet_type = 'company_sms' and owner_school_id is null and owner_profile_id is null;
  if cwid is null then return; end if;

  insert into public.wallet_ledger_entries (wallet_id, quantity, amount, reason, note, ref)
  values (
    cwid, -bal, 0, 'adjust',
    'Ticket #529: zeroing ' || (-bal) || ' segments of staging test sends made against a pool that was never stocked. Not a purchase — no payment is implied.',
    'adjust:529-reconcile'
  );
end $$;
