-- 0168_invoice_numbers_are_gapless_by_construction.sql
-- Map #524 / ticket #547: ~24,000 invoice numbers allocated for 1,276 invoices.
--
-- ADR 0012 requires a "gapless sequence per financial year" and says "a gap is an
-- audit finding". The implementation used a Postgres SEQUENCE, and a Postgres
-- sequence cannot be gapless — that is its documented design, not a bug in it.
-- `nextval` is deliberately non-transactional so concurrent writers never block on
-- each other, which means a number taken by a transaction that later rolls back is
-- gone permanently.
--
-- So the requirement and the mechanism contradicted each other from the day both
-- were written, and the data shows it: sequence at 25,251, invoices at 1,276,
-- drafts at zero.
--
-- Where the burns came from is worth recording, because the same shape will bite
-- again elsewhere. subscription_billing_sweep loops over every school inside one
-- function, which is one transaction. It takes a number per school, and if any
-- school raises part way through, every invoice in that run rolls back — while
-- every number it consumed stays consumed. The dedup rows in
-- subscription_billing_runs roll back too, so the next run bills the same schools
-- again and burns another full set.
--
-- Two changes: a counter that rolls back with its transaction, and a sweep where
-- one school's failure is one school's failure.

-- ---------------------------------------------------------------------------
-- 1. A counter, not a sequence.
--
-- One row per financial year, incremented under a row lock inside the caller's
-- transaction. Concurrent issuers serialise on that row — which is precisely the
-- cost a sequence exists to avoid, and precisely the cost gapless numbering
-- requires. There is no third option: gapless and lock-free are mutually
-- exclusive.
--
-- Invoicing is a low-rate operation measured in documents per day, so serialising
-- is free in practice.
create table if not exists public.invoice_number_counters (
  year         integer primary key,
  last_number  bigint  not null default 0
);

alter table public.invoice_number_counters enable row level security;

-- Policies land in 0169: an earlier draft of this migration left the table with
-- RLS on and no policies at all, which made the numbering state invisible to the
-- Super Admin — working against the auditability ADR 0012 asks for.

comment on table public.invoice_number_counters is
  'Gapless per-year invoice numbering (ADR 0012). Replaces invoice_number_seq: a Postgres sequence is non-transactional by design, so a rolled-back issue burned its number permanently — 24,000 of them (#547).';

-- Seed from the sequence rather than from max(invoices.number), so newly issued
-- numbers cannot collide with any already printed. The historical discontinuity
-- below 25,251 is left alone: filling it would mean inventing documents, and ADR
-- 0012's whole point is that documents are not invented.
insert into public.invoice_number_counters (year, last_number)
select extract(year from now())::integer,
       greatest(coalesce((select last_value from public.invoice_number_seq), 0), 0)
on conflict (year) do nothing;

create or replace function public.invoice_number_next(p_year integer)
returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  -- The insert-then-update shape handles the first document of a new financial
  -- year without a separate seeding step.
  insert into public.invoice_number_counters (year, last_number)
  values (p_year, 0)
  on conflict (year) do nothing;

  update public.invoice_number_counters
     set last_number = last_number + 1
   where year = p_year
  returning last_number into n;

  return n;
end;
$$;

comment on function public.invoice_number_next(integer) is
  'Allocate the next invoice number for a financial year. Rolls back with the caller''s transaction, which is what makes the sequence gapless (ADR 0012, #547).';

-- ---------------------------------------------------------------------------
-- 2. Issue against the counter.
--
-- The allocation stays exactly where it was in the sequence of steps — after the
-- validation, before the insert. What changes is that abandoning it now returns
-- it.
create or replace function public.invoice_create(
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
  yr integer;
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

  yr := extract(year from now())::integer;
  inv_number := 'INV-' || yr::text || '-' || lpad(public.invoice_number_next(yr)::text, 5, '0');

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
    jsonb_build_object('account_code', p_income_account, 'debit', 0, 'credit', subtotal));
  if coalesce(p_tax_amount, 0) > 0 then
    gl_lines := gl_lines || jsonb_build_array(jsonb_build_object('account_code', '2000', 'debit', 0, 'credit', p_tax_amount));
  end if;
  perform public.gl_post('invoice:' || inv_id, 'Invoice ' || inv_number, gl_lines, p_school_id, job_secret);

  -- Reproduced verbatim from 0112, including publish_domain_event's null final
  -- argument: this migration changes where the NUMBER comes from and nothing else,
  -- and an audit write quietly dropped here would be its own finding.
  perform public.publish_domain_event('InvoiceGenerated', p_school_id,
    jsonb_build_object('invoiceId', inv_id, 'number', inv_number, 'total', total), null, null);
  perform public.record_audit('invoice', inv_id::text, 'create', p_school_id, null, null,
    jsonb_build_object('number', inv_number, 'total', total), null, null, null, job_secret);

  return inv_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. One school's failure is one school's failure.
--
-- The sweep billed every school in one transaction, so a single raise discarded
-- the whole run — every invoice, and the dedup rows that would have stopped the
-- next run repeating it. With a per-school exception block the failure is isolated
-- to a savepoint: that school's number is returned along with its invoice, and the
-- other fifty-one still get billed.
create or replace function public.subscription_billing_sweep(p_period text, job_secret text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare s record; cnt integer; inv uuid; billed integer := 0;
begin
  if not public.is_system_caller(job_secret) then raise exception 'not authorized'; end if;
  for s in select id from public.schools loop
    if exists (select 1 from public.subscription_billing_runs where school_id = s.id and period = p_period) then
      continue;
    end if;
    begin
      select count(*) into cnt from public.students where school_id = s.id;
      inv := public.subscription_bill(s.id, cnt, 1, null, null, job_secret);
      insert into public.subscription_billing_runs (school_id, period, invoice_id) values (s.id, p_period, inv);
      billed := billed + 1;
    exception when others then
      -- Roll back to before this school and carry on. The number it took is
      -- returned with it, which is the whole point of the counter above.
      raise warning 'billing sweep skipped school %: %', s.id, sqlerrm;
    end;
  end loop;
  return billed;
end;
$$;
