-- 0094_financial_reporting.sql
-- Financial reporting / BI read-model (master_prd.md doc 005 gap). A single
-- super-admin summary derived directly from the GL (0085) + invoices (0086) —
-- the ledger is the source of truth, so reports don't re-aggregate per module.
-- Amounts in poisha.
create or replace function public.financial_summary()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'not authorized';
  end if;
  select jsonb_build_object(
    'gross_revenue', coalesce((select sum(credit - debit) from public.gl_lines
       where account_code in ('4000', '4100', '4200', '4300')), 0),
    'collected', coalesce((select sum(debit - credit) from public.gl_lines where account_code = '1000'), 0),
    'outstanding', coalesce((select sum(total_amount) from public.invoices where status = 'issued'), 0),
    'commission_payable', coalesce((select sum(credit - debit) from public.gl_lines where account_code = '2100'), 0),
    'subscription_income', coalesce((select sum(credit - debit) from public.gl_lines where account_code = '4000'), 0),
    'sms_income', coalesce((select sum(credit - debit) from public.gl_lines where account_code = '4100'), 0),
    'fee_income', coalesce((select sum(credit - debit) from public.gl_lines where account_code = '4300'), 0),
    'paid_invoice_count', coalesce((select count(*) from public.invoices where status = 'paid'), 0)
  ) into r;
  return r;
end;
$$;
