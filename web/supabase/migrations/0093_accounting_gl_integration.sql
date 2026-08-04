-- 0093_accounting_gl_integration.sql
-- Close the top architectural gap (master_prd.md doc 005): "individual modules
-- must never implement independent accounting logic ... every business activity
-- generates standardized ledger entries." School fee collection recorded its own
-- money (fee_collection_records) without touching the central GL (0085). This
-- routes every fee cash movement into the double-entry GL via a trigger.
--
-- Behavior-preserving + additive: the fee records are unchanged; a balanced GL
-- entry (Cash debit / Fee Income credit, or the reverse on a correction) is
-- posted for the DELTA of pay_amount on each insert/update. Amounts in poisha.

-- Fee income account (school-scoped revenue).
insert into public.gl_accounts (code, name, type, normal_side) values
  ('4300', '{"en":"Fee Income"}', 'income', 'credit')
  on conflict (code) do nothing;

-- Unique ref per posting so each fee change is its own GL entry (gl_post is
-- idempotent on ref; fee changes are intentionally distinct entries).
create sequence if not exists public.fee_gl_seq;

-- Shared posting core (no caller authz) used by gl_post (external, gated) and
-- gl_post_system (trigger-only). Validates balance, inserts, audits.
create or replace function public.gl_post_core(p_ref text, p_memo text, p_lines jsonb, p_school_id uuid, job_secret text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare entry_id uuid; total_debit bigint; total_credit bigint; ln jsonb;
begin
  select id into entry_id from public.gl_entries where ref = p_ref;
  if entry_id is not null then return entry_id; end if;
  select coalesce(sum((l->>'debit')::bigint), 0), coalesce(sum((l->>'credit')::bigint), 0)
    into total_debit, total_credit from jsonb_array_elements(p_lines) l;
  if total_debit <> total_credit or total_debit = 0 then
    raise exception 'unbalanced or empty journal entry (debit=%, credit=%)', total_debit, total_credit;
  end if;
  insert into public.gl_entries (ref, memo, school_id) values (p_ref, p_memo, p_school_id) returning id into entry_id;
  for ln in select * from jsonb_array_elements(p_lines) loop
    insert into public.gl_lines (entry_id, account_code, debit, credit)
    values (entry_id, ln->>'account_code', coalesce((ln->>'debit')::bigint, 0), coalesce((ln->>'credit')::bigint, 0));
  end loop;
  perform public.record_audit('gl_entry', entry_id::text, 'create', p_school_id, null, null,
    jsonb_build_object('ref', p_ref, 'debit', total_debit), null, null, null, job_secret);
  return entry_id;
end;
$$;

-- External post: caller must be super/system, then delegate to the core.
create or replace function public.gl_post(
  p_ref text, p_memo text, p_lines jsonb, p_school_id uuid default null, job_secret text default null
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_or_system(job_secret) then raise exception 'not authorized to post to the ledger'; end if;
  return public.gl_post_core(p_ref, p_memo, p_lines, p_school_id, job_secret);
end;
$$;

-- Trigger-only post: trusted because it can only run inside a trigger.
create or replace function public.gl_post_system(p_ref text, p_memo text, p_lines jsonb, p_school_id uuid)
  returns uuid language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 0 then raise exception 'gl_post_system is trigger-only'; end if;
  return public.gl_post_core(p_ref, p_memo, p_lines, p_school_id, null);
end;
$$;

-- Post the fee cash delta to the GL on every fee record insert/update.
create or replace function public.fee_post_gl() returns trigger
  language plpgsql security definer set search_path = public as $$
declare delta_taka numeric; d bigint; ref text;
begin
  delta_taka := new.pay_amount - coalesce(old.pay_amount, 0);
  if delta_taka = 0 then return new; end if;
  d := round(delta_taka * 100)::bigint;
  ref := 'fee:' || new.id || ':' || nextval('public.fee_gl_seq');
  if d > 0 then
    perform public.gl_post_system(ref, 'Fee ' || new.month || '/' || new.year,
      jsonb_build_array(
        jsonb_build_object('account_code', '1000', 'debit', d, 'credit', 0),
        jsonb_build_object('account_code', '4300', 'debit', 0, 'credit', d)), new.school_id);
  else
    perform public.gl_post_system(ref, 'Fee correction ' || new.month || '/' || new.year,
      jsonb_build_array(
        jsonb_build_object('account_code', '4300', 'debit', -d, 'credit', 0),
        jsonb_build_object('account_code', '1000', 'debit', 0, 'credit', -d)), new.school_id);
  end if;
  return new;
end;
$$;

create trigger fee_gl_post after insert or update of pay_amount on public.fee_collection_records
  for each row execute function public.fee_post_gl();
