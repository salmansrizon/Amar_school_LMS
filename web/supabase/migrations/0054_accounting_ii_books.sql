-- Accounting II (issue #35, PRD §5.6): vouchers (Income/Expense categories +
-- attachments), asset register (categories, depreciation, attachments),
-- bank/cash accounts (deposit/withdraw, cheque tracking), director capital
-- (invest/withdraw, running balance). The consolidated General Ledger is
-- built in TypeScript from these tables + fee_collection_records (0016) — see
-- lib/accounting.ts's buildGeneralLedger — rather than a DB view, since RLS
-- already scopes every source table per-school and the aggregation itself is
-- a pure, unit-testable merge/sort/running-sum.
--
-- Negative/insufficient-balance guards are enforced here at the DB level
-- (triggers that raise a real exception), not just in the UI, matching
-- Accounting I's fee_collection_records unique-constraint precedent (0016)
-- of a real DB-level guard over a UI-only check.
-- Additive only (staging and main share this database).

-- ============================================================
-- Voucher categories + vouchers
-- ============================================================

create table public.voucher_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (school_id, name, type)
);
create index voucher_categories_school_idx on public.voucher_categories (school_id);

alter table public.voucher_categories enable row level security;
create policy "school members manage voucher_categories" on public.voucher_categories
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages voucher_categories" on public.voucher_categories
  for all using (public.app_current_role() = 'super_admin');

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  category_id uuid not null references public.voucher_categories (id) on delete restrict,
  voucher_no text,
  txn_date date not null default current_date,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, voucher_no)
);
create index vouchers_school_idx on public.vouchers (school_id, txn_date desc);

alter table public.vouchers enable row level security;
create policy "school members manage vouchers" on public.vouchers
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages vouchers" on public.vouchers
  for all using (public.app_current_role() = 'super_admin');

-- category_id must belong to the row's own School (mirrors
-- enforce_fee_structure_school, 0039 — a foreign category id from another
-- School could otherwise slip past RLS since the row's own school_id column
-- is still correct).
create function public.enforce_voucher_category_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from voucher_categories where id = new.category_id and school_id = new.school_id
  ) then
    raise exception 'voucher category does not belong to this school';
  end if;
  return new;
end $$;

create trigger voucher_category_same_school
  before insert or update on public.vouchers
  for each row execute function public.enforce_voucher_category_school();

-- Auto-number: VCH-{year}-{seq:04d} per School per Year (matches
-- ui/school-owner/vouchers-list.html's "VCH-2026-0142" format). Advisory-lock
-- serialized per School+year (mirrors assign_student_roll, 0034) so two
-- concurrent inserts can't compute the same sequence number; the unique
-- constraint above backstops any residual collision.
create function public.assign_voucher_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_year int;
  v_seq int;
begin
  if new.voucher_no is null or new.voucher_no = '' then
    v_year := extract(year from coalesce(new.txn_date, current_date));
    perform pg_advisory_xact_lock(
      hashtextextended(new.school_id::text || ':voucher:' || v_year::text, 0)
    );
    select count(*) + 1 into v_seq
    from vouchers
    where school_id = new.school_id and extract(year from txn_date) = v_year;
    new.voucher_no := 'VCH-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end $$;

create trigger voucher_auto_number
  before insert on public.vouchers
  for each row execute function public.assign_voucher_no();

-- Attachment size cap (PRD §7: "vouchers/assets: 500KB image, 5MB PDF"),
-- shared by vouchers and assets below (same attachment_mime/attachment_size
-- column shape on both tables). Real DB-level enforcement, not just the
-- upload UI's client-side check — mirrors enforce_gallery_photo_cap (0041).
create function public.enforce_attachment_cap() returns trigger
language plpgsql as $$
begin
  if new.attachment_path is not null then
    if new.attachment_mime like 'image/%' then
      if new.attachment_size > 512000 then
        raise exception 'image attachment exceeds the 500KB limit';
      end if;
    elsif new.attachment_mime = 'application/pdf' then
      if new.attachment_size > 5242880 then
        raise exception 'PDF attachment exceeds the 5MB limit';
      end if;
    else
      raise exception 'unsupported attachment type';
    end if;
  end if;
  return new;
end $$;

create trigger voucher_attachment_cap
  before insert or update on public.vouchers
  for each row execute function public.enforce_attachment_cap();

-- ============================================================
-- Asset categories + assets (register: categories, depreciation, attachments)
-- ============================================================

create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index asset_categories_school_idx on public.asset_categories (school_id);

alter table public.asset_categories enable row level security;
create policy "school members manage asset_categories" on public.asset_categories
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages asset_categories" on public.asset_categories
  for all using (public.app_current_role() = 'super_admin');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  category_id uuid not null references public.asset_categories (id) on delete restrict,
  name text not null,
  purchase_date date not null default current_date,
  purchase_value numeric(12, 2) not null default 0 check (purchase_value >= 0),
  depreciation_rate_percent numeric(5, 2) not null default 0
    check (depreciation_rate_percent between 0 and 100),
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size int,
  created_at timestamptz not null default now()
);
create index assets_school_idx on public.assets (school_id);

alter table public.assets enable row level security;
create policy "school members manage assets" on public.assets
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages assets" on public.assets
  for all using (public.app_current_role() = 'super_admin');

create function public.enforce_asset_category_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from asset_categories where id = new.category_id and school_id = new.school_id
  ) then
    raise exception 'asset category does not belong to this school';
  end if;
  return new;
end $$;

create trigger asset_category_same_school
  before insert or update on public.assets
  for each row execute function public.enforce_asset_category_school();

create trigger asset_attachment_cap
  before insert or update on public.assets
  for each row execute function public.enforce_attachment_cap();

-- ============================================================
-- Bank / cash accounts (deposit / withdraw, cheque tracking)
-- ============================================================

create table public.bank_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  name text not null,
  type text not null check (type in ('cash', 'bank')),
  balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);
create index bank_cash_accounts_school_idx on public.bank_cash_accounts (school_id);

alter table public.bank_cash_accounts enable row level security;
create policy "school members manage bank_cash_accounts" on public.bank_cash_accounts
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages bank_cash_accounts" on public.bank_cash_accounts
  for all using (public.app_current_role() = 'super_admin');

create table public.bank_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  account_id uuid not null references public.bank_cash_accounts (id) on delete cascade,
  txn_type text not null check (txn_type in ('deposit', 'withdraw')),
  amount numeric(12, 2) not null check (amount > 0),
  txn_date date not null default current_date,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'cheque')),
  cheque_no text,
  cheque_date date,
  reason text,
  balance_after numeric(12, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint bank_cash_cheque_fields_need_cheque_method check (
    payment_method = 'cheque' or (cheque_no is null and cheque_date is null)
  )
);
create index bank_cash_transactions_account_idx
  on public.bank_cash_transactions (account_id, txn_date);

alter table public.bank_cash_transactions enable row level security;
create policy "school members manage bank_cash_transactions" on public.bank_cash_transactions
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages bank_cash_transactions" on public.bank_cash_transactions
  for all using (public.app_current_role() = 'super_admin');

-- Real DB-level insufficient-balance guard (PRD §5.6/§7): locks the account
-- row, computes the new balance, rejects a withdraw that would go negative,
-- and stamps balance_after for the account's transaction history — all
-- inside one transaction so concurrent deposits/withdraws on the same
-- account can't race past the check.
create function public.apply_bank_cash_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric(12, 2);
  v_account_school uuid;
  v_new_balance numeric(12, 2);
begin
  select balance, school_id into v_balance, v_account_school
  from bank_cash_accounts where id = new.account_id for update;

  if not found or v_account_school is distinct from new.school_id then
    raise exception 'account does not belong to this school';
  end if;

  if new.txn_type = 'deposit' then
    v_new_balance := v_balance + new.amount;
  else
    v_new_balance := v_balance - new.amount;
    if v_new_balance < 0 then
      raise exception 'insufficient balance: withdrawal exceeds current balance of %', v_balance;
    end if;
  end if;

  update bank_cash_accounts set balance = v_new_balance where id = new.account_id;
  new.balance_after := v_new_balance;
  return new;
end $$;

create trigger bank_cash_transaction_apply
  before insert on public.bank_cash_transactions
  for each row execute function public.apply_bank_cash_transaction();

-- ============================================================
-- Director capital (invest / withdraw, running balance)
-- ============================================================

create table public.director_capital_balances (
  school_id uuid primary key references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  balance numeric(12, 2) not null default 0
);
alter table public.director_capital_balances enable row level security;
create policy "school members read director_capital_balances" on public.director_capital_balances
  for select using (school_id = public.app_current_school_id());
create policy "super admin manages director_capital_balances" on public.director_capital_balances
  for all using (public.app_current_role() = 'super_admin');

create table public.director_capital_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  txn_type text not null check (txn_type in ('invest', 'withdraw')),
  amount numeric(12, 2) not null check (amount > 0),
  txn_date date not null default current_date,
  note text,
  balance_after numeric(12, 2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index director_capital_transactions_school_idx
  on public.director_capital_transactions (school_id, txn_date);

alter table public.director_capital_transactions enable row level security;
create policy "school members manage director_capital_transactions" on public.director_capital_transactions
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages director_capital_transactions" on public.director_capital_transactions
  for all using (public.app_current_role() = 'super_admin');

-- Same insufficient-balance guard shape as bank/cash accounts above, but
-- against a single running balance-per-School row (director capital has no
-- concept of multiple named accounts), lazily created on first transaction.
create function public.apply_director_capital_transaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric(12, 2);
  v_new_balance numeric(12, 2);
begin
  insert into director_capital_balances (school_id, balance)
  values (new.school_id, 0)
  on conflict (school_id) do nothing;

  select balance into v_balance
  from director_capital_balances where school_id = new.school_id for update;

  if new.txn_type = 'invest' then
    v_new_balance := v_balance + new.amount;
  else
    v_new_balance := v_balance - new.amount;
    if v_new_balance < 0 then
      raise exception 'insufficient balance: withdrawal exceeds current director capital balance of %', v_balance;
    end if;
  end if;

  update director_capital_balances set balance = v_new_balance where school_id = new.school_id;
  new.balance_after := v_new_balance;
  return new;
end $$;

create trigger director_capital_transaction_apply
  before insert on public.director_capital_transactions
  for each row execute function public.apply_director_capital_transaction();

-- ============================================================
-- Attachments: shared private bucket for voucher/asset files
-- ============================================================
-- The bucket-level file_size_limit is a generous hard ceiling (matches the
-- gallery bucket's precedent, 0042); the real, PRD-mandated 500KB-image /
-- 5MB-PDF caps are enforced above by enforce_attachment_cap.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accounting-attachments', 'accounting-attachments', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "school members read own accounting attachment objects" on storage.objects
  for select to authenticated using (
    bucket_id = 'accounting-attachments'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members write own accounting attachment objects" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'accounting-attachments'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members update own accounting attachment objects" on storage.objects
  for update to authenticated using (
    bucket_id = 'accounting-attachments'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "school members delete own accounting attachment objects" on storage.objects
  for delete to authenticated using (
    bucket_id = 'accounting-attachments'
    and (storage.foldername(name))[1] = public.app_current_school_id()::text
  );
create policy "super admin manages accounting attachment objects" on storage.objects
  for all to authenticated using (
    bucket_id = 'accounting-attachments' and public.app_current_role() = 'super_admin'
  );
