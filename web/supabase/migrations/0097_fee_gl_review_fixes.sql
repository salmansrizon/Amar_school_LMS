-- 0097_fee_gl_review_fixes.sql
-- Review fixes for the fee→GL integration (0093):
--   BUG: deleting a fee record orphaned its GL entries (Cash/income overstated).
--        Add a DELETE trigger that posts the reversing contra.
--   COVERAGE: 0093 posted only the pay_amount cash leg. Now also post the FINE
--        leg (Fine Income) and split the cash debit by payment_method
--        (cash → Cash, cheque/bank → Bank). adjust_amount/due_amount (waivers /
--        receivables) and the Accounting-II module (vouchers, bank_cash,
--        director_capital) still post no GL — tracked in #271 (large, separate).
--
-- All balanced double-entry, poisha, additive. Uses a credit-positive signed
-- convention: fee=+Δpay, fine=+Δfine, cash=-(Δpay+Δfine) (debit when income up).

insert into public.gl_accounts (code, name, type, normal_side) values
  ('1050', '{"en":"Bank"}', 'asset', 'debit'),
  ('4400', '{"en":"Fine Income"}', 'income', 'credit')
  on conflict (code) do nothing;

-- One GL line from a credit-positive signed amount (skip callers filter zeros).
create or replace function public.gl_line(p_account text, p_signed bigint)
  returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'account_code', p_account,
    'debit', case when p_signed < 0 then -p_signed else 0 end,
    'credit', case when p_signed > 0 then p_signed else 0 end);
$$;

-- Post fee+fine cash movement for a record. pp/ff are poisha deltas (credit-
-- positive on income). Emits a balanced entry, skipping zero legs.
create or replace function public.fee_gl_apply(
  p_id uuid, p_school uuid, p_memo text, pp bigint, ff bigint, cash_acct text
) returns void language plpgsql security definer set search_path = public as $$
declare lines jsonb := '[]'::jsonb;
begin
  if pp = 0 and ff = 0 then return; end if;
  if pp <> 0 then lines := lines || public.gl_line('4300', pp); end if;
  if ff <> 0 then lines := lines || public.gl_line('4400', ff); end if;
  lines := lines || public.gl_line(cash_acct, -(pp + ff)); -- cash offsets income
  perform public.gl_post_system('fee:' || p_id || ':' || nextval('public.fee_gl_seq'), p_memo, lines, p_school);
end;
$$;

create or replace function public.fee_post_gl() returns trigger
  language plpgsql security definer set search_path = public as $$
declare pp bigint; ff bigint; cash_acct text;
begin
  pp := round((new.pay_amount - coalesce(old.pay_amount, 0)) * 100)::bigint;
  ff := round((new.fine_amount - coalesce(old.fine_amount, 0)) * 100)::bigint;
  cash_acct := case when new.payment_method = 'cash' then '1000' else '1050' end;
  perform public.fee_gl_apply(new.id, new.school_id,
    'Fee ' || new.month || '/' || new.year, pp, ff, cash_acct);
  return new;
end;
$$;

-- Reverse the whole record's cash+fine on delete (contra).
create or replace function public.fee_post_gl_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
declare cash_acct text;
begin
  cash_acct := case when old.payment_method = 'cash' then '1000' else '1050' end;
  perform public.fee_gl_apply(old.id, old.school_id,
    'Fee reversal ' || old.month || '/' || old.year,
    -round(old.pay_amount * 100)::bigint, -round(old.fine_amount * 100)::bigint, cash_acct);
  return old;
end;
$$;

drop trigger if exists fee_gl_post on public.fee_collection_records;
create trigger fee_gl_post after insert or update of pay_amount, fine_amount on public.fee_collection_records
  for each row execute function public.fee_post_gl();
drop trigger if exists fee_gl_delete on public.fee_collection_records;
create trigger fee_gl_delete after delete on public.fee_collection_records
  for each row execute function public.fee_post_gl_delete();

-- Tighten notification_from_template: a tenant (non-system) caller may only
-- notify a recipient who belongs to the target school.
create or replace function public.notification_from_template(
  p_recipient uuid, p_school uuid, p_template_key text, p_data jsonb, job_secret text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare tpl record; ttl text; bdy text; k text; v text; n_id uuid; is_sys boolean;
begin
  is_sys := public.app_current_role() = 'super_admin' or public.is_super_or_system(job_secret);
  if not is_sys then
    if not public.app_tenant_member(p_school) then raise exception 'not authorized to notify'; end if;
    if not exists (select 1 from public.profiles where id = p_recipient and school_id = p_school) then
      raise exception 'recipient is not a member of this school';
    end if;
  end if;
  select title, body into tpl from public.notification_templates where key = p_template_key;
  if not found then raise exception 'unknown notification template: %', p_template_key; end if;
  ttl := coalesce(tpl.title->>'bn', tpl.title->>'en', '');
  bdy := coalesce(tpl.body->>'bn', tpl.body->>'en', '');
  for k, v in select key, value from jsonb_each_text(coalesce(p_data, '{}'::jsonb)) loop
    ttl := replace(ttl, '{{' || k || '}}', v);
    bdy := replace(bdy, '{{' || k || '}}', v);
  end loop;
  insert into public.notifications (recipient_id, school_id, title, body)
  values (p_recipient, p_school, ttl, bdy) returning id into n_id;
  return n_id;
end;
$$;
