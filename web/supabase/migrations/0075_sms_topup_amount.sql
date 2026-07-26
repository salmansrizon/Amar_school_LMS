-- 0075_sms_topup_amount.sql
-- SMS-credit top-ups carry the ৳ the admin collected (map #171 T7). The T6 ledger
-- tracks credits (segments) as `delta`; this adds the money so SMS income is a
-- reportable stream separate from subscription income. Null on send/adjust rows.
alter table public.sms_credit_ledger
  add column amount numeric(12, 2) check (amount is null or amount >= 0);

-- Guarded balance read for display (admin T7 / owner T9). The ledger grows a row
-- per send, so callers must not sum client-side; this returns the authoritative
-- balance. Same authorization gate as the T6 debit functions (super-admin, own
-- school, or the cron secret).
create or replace function public.sms_balance_for(sid uuid, job_secret text default null) returns integer
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sms_authorized_for(sid, job_secret) then
    raise exception 'not authorized for this school';
  end if;
  return public.sms_balance(sid);
end;
$$;
revoke execute on function public.sms_balance_for(uuid, text) from public;
grant execute on function public.sms_balance_for(uuid, text) to authenticated, service_role;
