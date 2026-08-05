-- 0112_distributor_invoicing.sql
-- #319 (from #290 research, Option B): let a super-admin bill a DISTRIBUTOR, not
-- just a school. Additive + behaviour-preserving for school invoicing.
--   invoices.school_id becomes nullable; a new distributor_id; exactly one party.
-- gl_entries.school_id is already nullable, so distributor invoices post GL with
-- school_id = null (platform-scoped) with no GL schema change.

alter table public.invoices alter column school_id drop not null;
alter table public.invoices add column if not exists distributor_id uuid references public.profiles (id);
alter table public.invoices
  add constraint invoice_one_party check (num_nonnulls(school_id, distributor_id) = 1) not valid;
alter table public.invoices validate constraint invoice_one_party;

-- Distributor sees its own invoices (schools already have their policy).
drop policy if exists "distributor reads own invoices" on public.invoices;
create policy "distributor reads own invoices" on public.invoices
  for select using (distributor_id = auth.uid());

-- Lines/payments visibility now also covers a distributor's own invoice.
create or replace function public.invoice_visible(p_invoice uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invoices i
    where i.id = p_invoice
      and (public.app_tenant_member(i.school_id)
           or i.distributor_id = auth.uid()
           or public.app_current_role() = 'super_admin')
  );
$$;

-- invoice_create gains p_distributor_id. Adding a defaulted param changes the
-- signature, so drop the old one first (PostgREST overload-resolution gotcha).
-- p_distributor_id goes LAST (after job_secret): 0091's subscription-billing call
-- is positional with job_secret 7th, so a mid-signature param would misbind it.
-- Body preserves 0088's is_super_or_system authz.
drop function if exists public.invoice_create(uuid, jsonb, bigint, text, timestamptz, text, text);
create function public.invoice_create(
  p_school_id uuid,
  p_lines jsonb,
  p_tax_amount bigint default 0,
  p_income_account text default '4000',
  p_due_at timestamptz default null,
  p_memo text default '',
  job_secret text default null,
  p_distributor_id uuid default null
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
  if not public.is_super_or_system(job_secret) then
    raise exception 'not authorized to issue invoices';
  end if;
  if num_nonnulls(p_school_id, p_distributor_id) <> 1 then
    raise exception 'exactly one of school or distributor must be the invoice party';
  end if;

  select coalesce(sum((l->>'quantity')::bigint * (l->>'unit_amount')::bigint), 0)
    into subtotal from jsonb_array_elements(p_lines) l;
  if subtotal <= 0 then raise exception 'invoice must have a positive subtotal'; end if;
  total := subtotal + coalesce(p_tax_amount, 0);
  inv_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');

  insert into public.invoices (number, school_id, distributor_id, income_account, subtotal_amount, tax_amount, total_amount, memo, due_at)
  values (inv_number, p_school_id, p_distributor_id, p_income_account, subtotal, coalesce(p_tax_amount, 0), total, p_memo, p_due_at)
  returning id into inv_id;

  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines (invoice_id, description, quantity, unit_amount, amount)
    values (inv_id, ln->>'description', coalesce((ln->>'quantity')::bigint, 1), (ln->>'unit_amount')::bigint,
      coalesce((ln->>'quantity')::bigint, 1) * (ln->>'unit_amount')::bigint);
  end loop;

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

-- payment_record: a distributor may record a payment on its own invoice too.
-- Preserves 0088's audit call.
create or replace function public.payment_record(
  p_invoice_id uuid, p_amount bigint, p_method text, p_reference text default null, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare inv public.invoices; pay_id uuid;
begin
  select * into inv from public.invoices where id = p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  if not (public.app_tenant_member(inv.school_id)
          or inv.distributor_id = auth.uid()
          or public.is_system_caller(job_secret)) then
    raise exception 'not authorized for this invoice';
  end if;
  insert into public.payments (invoice_id, amount, method, reference)
  values (p_invoice_id, p_amount, p_method, p_reference) returning id into pay_id;
  perform public.record_audit('payment', pay_id::text, 'create', inv.school_id, null, null,
    jsonb_build_object('amount', p_amount, 'method', p_method), null, null, null, job_secret);
  return pay_id;
end;
$$;
