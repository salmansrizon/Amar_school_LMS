-- 0086_invoicing_payments.sql
-- Financial Engine part B (map #258, #266): invoices + manual payments, both
-- posting into the double-entry GL (0085). Payments fork locked to DEFAULT:
-- manual verification (record -> super-admin confirm); gateway integration
-- deferred behind a later adapter. Amounts are integer minor units (poisha).
--
-- Accounting: issuing an invoice posts AR debit = income credit (+ tax credit);
-- confirming a payment posts cash debit = AR credit. Emits InvoiceGenerated /
-- InvoicePaid domain events (consumed by Audit now, Notification/Commission later).

create sequence if not exists public.invoice_number_seq;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  school_id uuid not null references public.schools (id) on delete cascade,
  status text not null default 'issued' check (status in ('draft', 'issued', 'paid', 'void')),
  income_account text not null references public.gl_accounts (code),
  subtotal_amount bigint not null,
  tax_amount bigint not null default 0,
  total_amount bigint not null,
  currency text not null default 'BDT',
  memo text not null default '',
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create index invoices_school_idx on public.invoices (school_id, status);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity bigint not null default 1,
  unit_amount bigint not null,
  amount bigint not null
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount bigint not null check (amount > 0),
  method text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'void')),
  reference text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id, status);

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;

create policy "super admin reads invoices" on public.invoices
  for select using (public.app_current_role() = 'super_admin');
create policy "school reads own invoices" on public.invoices
  for select using (school_id = public.app_current_school_id());

create or replace function public.invoice_visible(p_invoice uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invoices i where i.id = p_invoice and public.app_tenant_member(i.school_id));
$$;
create policy "read visible invoice_lines" on public.invoice_lines
  for select using (public.invoice_visible(invoice_id));
create policy "read visible payments" on public.payments
  for select using (public.invoice_visible(invoice_id));

-- Issue an invoice (super-admin or system) and post it to the GL.
create or replace function public.invoice_create(
  p_school_id uuid,
  p_lines jsonb,
  p_tax_amount bigint default 0,
  p_income_account text default '4000',
  p_due_at timestamptz default null,
  p_memo text default '',
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  inv_id uuid;
  inv_number text;
  subtotal bigint;
  total bigint;
  ln jsonb;
  gl_lines jsonb;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized to issue invoices';
  end if;

  select coalesce(sum((l->>'quantity')::bigint * (l->>'unit_amount')::bigint), 0)
    into subtotal from jsonb_array_elements(p_lines) l;
  if subtotal <= 0 then raise exception 'invoice must have a positive subtotal'; end if;
  total := subtotal + coalesce(p_tax_amount, 0);
  inv_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');

  insert into public.invoices (number, school_id, income_account, subtotal_amount, tax_amount, total_amount, memo, due_at)
  values (inv_number, p_school_id, p_income_account, subtotal, coalesce(p_tax_amount, 0), total, p_memo, p_due_at)
  returning id into inv_id;

  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines (invoice_id, description, quantity, unit_amount, amount)
    values (inv_id, ln->>'description', coalesce((ln->>'quantity')::bigint, 1), (ln->>'unit_amount')::bigint,
      coalesce((ln->>'quantity')::bigint, 1) * (ln->>'unit_amount')::bigint);
  end loop;

  -- GL: debit AR (total) = credit income (subtotal) + credit tax payable (tax).
  gl_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1100', 'debit', total, 'credit', 0),
    jsonb_build_object('account_code', p_income_account, 'debit', 0, 'credit', subtotal)
  );
  if coalesce(p_tax_amount, 0) > 0 then
    gl_lines := gl_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', 0, 'credit', p_tax_amount));
  end if;
  perform public.gl_post('invoice:' || inv_id, 'Invoice ' || inv_number, gl_lines, p_school_id, job_secret);

  perform public.publish_domain_event('InvoiceGenerated', p_school_id,
    jsonb_build_object('invoiceId', inv_id, 'number', inv_number, 'total', total), null, null);
  perform public.record_audit('invoice', inv_id::text, 'create', p_school_id, null, null,
    jsonb_build_object('number', inv_number, 'total', total), null, null, null, job_secret);
  return inv_id;
end;
$$;

-- Record a (manual) payment against an invoice — super/system or the invoice's
-- own school member. Starts as pending until confirmed.
create or replace function public.payment_record(
  p_invoice_id uuid,
  p_amount bigint,
  p_method text,
  p_reference text default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  pay_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  if not (public.app_tenant_member(inv.school_id) or public.is_system_caller(job_secret)) then
    raise exception 'not authorized for this invoice';
  end if;
  insert into public.payments (invoice_id, amount, method, reference)
  values (p_invoice_id, p_amount, p_method, p_reference) returning id into pay_id;
  return pay_id;
end;
$$;

-- Confirm a payment (super/system): post cash receipt to GL, mark the invoice
-- paid once fully covered, emit InvoicePaid.
create or replace function public.payment_confirm(p_payment_id uuid, job_secret text default null)
  returns text
  language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  inv public.invoices;
  confirmed_total bigint;
  new_status text;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized to confirm payments';
  end if;
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found'; end if;
  if pay.status <> 'pending' then raise exception 'payment is not pending'; end if;
  select * into inv from public.invoices where id = pay.invoice_id;

  update public.payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_payment_id;

  -- GL: debit cash = credit AR for the received amount.
  perform public.gl_post('payment:' || p_payment_id, 'Payment for ' || inv.number,
    jsonb_build_array(
      jsonb_build_object('account_code', '1000', 'debit', pay.amount, 'credit', 0),
      jsonb_build_object('account_code', '1100', 'debit', 0, 'credit', pay.amount)
    ), inv.school_id, job_secret);

  select coalesce(sum(amount), 0) into confirmed_total
    from public.payments where invoice_id = inv.id and status = 'confirmed';
  if confirmed_total >= inv.total_amount then
    update public.invoices set status = 'paid' where id = inv.id;
    new_status := 'paid';
    perform public.publish_domain_event('InvoicePaid', inv.school_id,
      jsonb_build_object('invoiceId', inv.id, 'number', inv.number, 'total', inv.total_amount), null, null);
  else
    new_status := inv.status;
  end if;

  perform public.record_audit('payment', p_payment_id::text, 'approve', inv.school_id, null, null,
    jsonb_build_object('amount', pay.amount, 'invoiceStatus', new_status), null, null, null, job_secret);
  return new_status;
end;
$$;
