-- 0098_accounting_ii_gl.sql
-- Complete the central-GL mandate (master_prd.md doc 005) for the Accounting-II
-- module (0055): vouchers, bank/cash transactions, and director-capital
-- transactions now mirror into the central double-entry GL (0085), so the
-- Financial Engine / financial_summary reflect ALL school money movement, not
-- just fees. Append-only ledgers → AFTER INSERT triggers, one GL entry per txn
-- (ref = kind:id, idempotent). Existing accounting books are unchanged (additive).

insert into public.gl_accounts (code, name, type, normal_side) values
  ('3000', '{"en":"Director Capital"}', 'equity', 'credit'),
  ('3100', '{"en":"Bank/Cash Clearing"}', 'equity', 'credit'),
  ('4500', '{"en":"Other Income"}', 'income', 'credit'),
  ('5100', '{"en":"Operating Expense"}', 'expense', 'debit')
  on conflict (code) do nothing;

-- Voucher: income → Cash debit / Other Income credit; expense → Expense debit /
-- Cash credit.
create or replace function public.voucher_post_gl() returns trigger
  language plpgsql security definer set search_path = public as $$
declare vtype text; d bigint;
begin
  select type into vtype from public.voucher_categories where id = new.category_id;
  d := round(new.amount * 100)::bigint;
  if vtype = 'income' then
    perform public.gl_post_system('voucher:' || new.id, 'Voucher ' || coalesce(new.voucher_no, new.id::text),
      jsonb_build_array(public.gl_line('1000', -d), public.gl_line('4500', d)), new.school_id);
  else
    perform public.gl_post_system('voucher:' || new.id, 'Voucher ' || coalesce(new.voucher_no, new.id::text),
      jsonb_build_array(public.gl_line('5100', -d), public.gl_line('1000', d)), new.school_id);
  end if;
  return new;
end;
$$;
drop trigger if exists voucher_gl_post on public.vouchers;
create trigger voucher_gl_post after insert on public.vouchers
  for each row execute function public.voucher_post_gl();

-- Bank/cash deposit → account (Cash/Bank) debit / Clearing credit; withdraw → reverse.
create or replace function public.bank_cash_post_gl() returns trigger
  language plpgsql security definer set search_path = public as $$
declare acct text; d bigint; sign int;
begin
  select case when type = 'bank' then '1050' else '1000' end into acct
    from public.bank_cash_accounts where id = new.account_id;
  d := round(new.amount * 100)::bigint;
  sign := case when new.txn_type = 'deposit' then 1 else -1 end;  -- +cash on deposit
  perform public.gl_post_system('bankcash:' || new.id, 'Bank/Cash ' || new.txn_type,
    jsonb_build_array(public.gl_line(acct, -d * sign), public.gl_line('3100', d * sign)), new.school_id);
  return new;
end;
$$;
drop trigger if exists bank_cash_gl_post on public.bank_cash_transactions;
create trigger bank_cash_gl_post after insert on public.bank_cash_transactions
  for each row execute function public.bank_cash_post_gl();

-- Director capital invest → Cash debit / Director Capital credit; withdraw → reverse.
create or replace function public.director_capital_post_gl() returns trigger
  language plpgsql security definer set search_path = public as $$
declare d bigint; sign int;
begin
  d := round(new.amount * 100)::bigint;
  sign := case when new.txn_type = 'invest' then 1 else -1 end;
  perform public.gl_post_system('dircap:' || new.id, 'Director capital ' || new.txn_type,
    jsonb_build_array(public.gl_line('1000', -d * sign), public.gl_line('3000', d * sign)), new.school_id);
  return new;
end;
$$;
drop trigger if exists director_capital_gl_post on public.director_capital_transactions;
create trigger director_capital_gl_post after insert on public.director_capital_transactions
  for each row execute function public.director_capital_post_gl();
