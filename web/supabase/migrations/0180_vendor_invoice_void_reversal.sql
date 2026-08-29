-- Void vendor invoices with immutable contra entries. Confirmed payments are
-- deliberately excluded; those need a refund/reconciliation workflow.

alter table public.invoice_revenue_schedule
  add column voided_at timestamptz;

create or replace function public.vendor_revenue_release(
  p_period date,
  job_secret text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare item record; released integer := 0; total bigint := 0; month date;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  month := date_trunc('month', p_period)::date;
  insert into public.revenue_release_runs (period) values (month)
    on conflict (period) do nothing;
  perform 1 from public.revenue_release_runs where period = month for update;
  for item in
    select s.invoice_id, s.amount, i.school_id, i.income_account, i.number
    from public.invoice_revenue_schedule s
    join public.invoices i on i.id = s.invoice_id
    where s.period = month and s.released_at is null and s.voided_at is null
    for update of s
  loop
    perform public.gl_post(
      'revenue-release:' || item.invoice_id || ':' || month,
      'Release revenue for ' || item.number || ' (' || month || ')',
      jsonb_build_array(
        jsonb_build_object('account_code', '2200', 'debit', item.amount, 'credit', 0),
        jsonb_build_object('account_code', item.income_account, 'debit', 0, 'credit', item.amount)
      ), item.school_id, job_secret);
    update public.invoice_revenue_schedule
      set released_at = now()
      where invoice_id = item.invoice_id and period = month;
    released := released + 1;
    total := total + item.amount;
  end loop;
  update public.revenue_release_runs
    set released_amount = released_amount + total,
        released_entries = released_entries + released
    where period = month;
  return released;
end;
$$;

create or replace function public.vendor_invoice_void(p_invoice uuid, job_secret text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare inv record; entry record; lines jsonb;
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized'; end if;
  select id, school_id, status, number into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'invoice not found'; end if;
  if inv.status = 'void' then return; end if;
  if inv.status <> 'issued' then raise exception 'only issued invoices can be voided'; end if;
  if exists (select 1 from public.payments where invoice_id = p_invoice and status = 'confirmed') then
    raise exception 'paid invoices require a refund workflow';
  end if;

  for entry in
    select id, ref from public.gl_entries
    where ref = 'invoice:' || p_invoice
       or ref = 'invoice-defer:' || p_invoice
       or ref like 'revenue-release:' || p_invoice || ':%'
    order by posted_at, id
  loop
    if not exists (select 1 from public.gl_entries where ref = 'reversal:' || entry.ref) then
      select jsonb_agg(jsonb_build_object(
        'account_code', account_code, 'debit', credit, 'credit', debit
      )) into lines from public.gl_lines where entry_id = entry.id;
      perform public.gl_post(
        'reversal:' || entry.ref,
        'Reverse ' || entry.ref,
        lines,
        inv.school_id,
        job_secret
      );
    end if;
  end loop;

  update public.invoice_revenue_schedule
    set voided_at = now()
    where invoice_id = p_invoice and voided_at is null;
  update public.invoices set status = 'void' where id = p_invoice;
end;
$$;

grant execute on function public.vendor_invoice_void(uuid, text) to authenticated, service_role;
