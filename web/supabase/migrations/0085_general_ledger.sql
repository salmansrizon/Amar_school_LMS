-- 0085_general_ledger.sql
-- Financial Engine part A — double-entry General Ledger (map #258, ticket #266).
-- The accounting truth every money flow posts into: subscriptions, SMS, invoices,
-- commissions, settlements (later slices) all record balanced GL entries here.
-- Amounts are integer minor units (poisha). Entries are immutable once posted
-- (RLS: read-only, no update/delete; writes via gl_post definer RPC only).
-- Heavy fork locked to DEFAULT: double-entry (chart of accounts, debit/credit),
-- reversal via contra entries (never edits).

create table public.gl_accounts (
  code text primary key,
  name jsonb not null default '{}'::jsonb,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  normal_side text not null check (normal_side in ('debit', 'credit'))
);

create table public.gl_entries (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,          -- idempotency key for the posting source
  memo text not null default '',
  school_id uuid references public.schools (id) on delete set null,
  posted_at timestamptz not null default now()
);

create table public.gl_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.gl_entries (id) on delete cascade,
  account_code text not null references public.gl_accounts (code),
  debit bigint not null default 0,
  credit bigint not null default 0,
  constraint gl_line_nonneg check (debit >= 0 and credit >= 0),
  constraint gl_line_one_side check (not (debit > 0 and credit > 0) and (debit > 0 or credit > 0))
);
create index gl_lines_entry_idx on public.gl_lines (entry_id);
create index gl_lines_account_idx on public.gl_lines (account_code);
create index gl_entries_school_idx on public.gl_entries (school_id, posted_at);

alter table public.gl_accounts enable row level security;
alter table public.gl_entries enable row level security;
alter table public.gl_lines enable row level security;

-- Chart of accounts is non-secret config; super-admin manages.
create policy "authenticated reads gl_accounts" on public.gl_accounts
  for select using (auth.uid() is not null);
create policy "super admin manages gl_accounts" on public.gl_accounts
  for all using (public.app_current_role() = 'super_admin');

-- Ledger is immutable + tenant-scoped read (super sees all, school sees its own).
-- No insert/update/delete policies: only gl_post (definer) writes.
create policy "super admin reads gl_entries" on public.gl_entries
  for select using (public.app_current_role() = 'super_admin');
create policy "school reads own gl_entries" on public.gl_entries
  for select using (school_id is not null and school_id = public.app_current_school_id());

create or replace function public.gl_entry_visible(p_entry uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.gl_entries e where e.id = p_entry and public.app_tenant_member(e.school_id)
  );
$$;
create policy "read visible gl_lines" on public.gl_lines
  for select using (public.gl_entry_visible(entry_id));

-- Minimal chart of accounts (extended additively as revenue streams land).
insert into public.gl_accounts (code, name, type, normal_side) values
  ('1000', '{"en":"Cash & Bank"}', 'asset', 'debit'),
  ('1100', '{"en":"Accounts Receivable"}', 'asset', 'debit'),
  ('2000', '{"en":"Tax Payable"}', 'liability', 'credit'),
  ('2100', '{"en":"Distributor Commission Payable"}', 'liability', 'credit'),
  ('4000', '{"en":"Subscription Income"}', 'income', 'credit'),
  ('4100', '{"en":"SMS Income"}', 'income', 'credit'),
  ('4200', '{"en":"Implementation Income"}', 'income', 'credit'),
  ('5000', '{"en":"Distributor Commission Expense"}', 'expense', 'debit');

-- Post a balanced double-entry journal entry (super-admin or system). Validates
-- sum(debit)=sum(credit)>0; idempotent on ref (repeat post returns existing id).
create or replace function public.gl_post(
  p_ref text,
  p_memo text,
  p_lines jsonb,
  p_school_id uuid default null,
  job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  entry_id uuid;
  total_debit bigint;
  total_credit bigint;
  ln jsonb;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_system_caller(job_secret)) then
    raise exception 'not authorized to post to the ledger';
  end if;

  -- Idempotency: a repeat post with the same ref is a no-op.
  select id into entry_id from public.gl_entries where ref = p_ref;
  if entry_id is not null then
    return entry_id;
  end if;

  select coalesce(sum((l->>'debit')::bigint), 0), coalesce(sum((l->>'credit')::bigint), 0)
    into total_debit, total_credit
  from jsonb_array_elements(p_lines) l;

  if total_debit <> total_credit or total_debit = 0 then
    raise exception 'unbalanced or empty journal entry (debit=%, credit=%)', total_debit, total_credit;
  end if;

  insert into public.gl_entries (ref, memo, school_id) values (p_ref, p_memo, p_school_id)
  returning id into entry_id;

  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into public.gl_lines (entry_id, account_code, debit, credit)
    values (entry_id, ln->>'account_code',
      coalesce((ln->>'debit')::bigint, 0), coalesce((ln->>'credit')::bigint, 0));
  end loop;

  perform public.record_audit('gl_entry', entry_id::text, 'create',
    p_school_id, null, null, jsonb_build_object('ref', p_ref, 'debit', total_debit),
    null, null, null, job_secret);
  return entry_id;
end;
$$;
