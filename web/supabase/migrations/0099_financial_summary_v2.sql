-- 0099_financial_summary_v2.sql
-- Extend the financial summary now that all accounting posts to the GL (0098):
-- include Other Income (4500) in revenue and report operating expense + net.
create or replace function public.financial_summary()
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; income bigint; expense bigint;
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'not authorized';
  end if;
  select coalesce(sum(credit - debit), 0) into income from public.gl_lines
    where account_code in ('4000', '4100', '4200', '4300', '4400', '4500');
  select coalesce(sum(debit - credit), 0) into expense from public.gl_lines
    where account_code in ('5000', '5100');
  select jsonb_build_object(
    'gross_revenue', income,
    'total_expense', expense,
    'net', income - expense,
    'collected', coalesce((select sum(debit - credit) from public.gl_lines where account_code in ('1000', '1050')), 0),
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
