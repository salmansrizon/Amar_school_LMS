-- SMS Compose + Log (issue #36, PRD §5.7). The absence-rule cron already
-- writes to sms_log (0021); this extends the same table so manual composes
-- and automated absence sends share one log, distinguished by `kind`, and so
-- the log screen can group per-recipient rows back into one row per send
-- action (`batch_id`) with a real success/failure status. Additive only.

alter table public.sms_log
  add column kind text not null default 'manual' check (kind in ('manual', 'absence_auto')),
  add column status text not null default 'sent' check (status in ('sent', 'failed')),
  add column batch_id uuid not null default gen_random_uuid(),
  add column recipient_label text,
  add column segments int not null default 1 check (segments >= 1);

-- Manual composes insert directly via RLS (0031) using the caller's session —
-- unlike the cron's job-secret RPC path, school_id isn't supplied by a
-- security-definer function, so give it the same default every sibling
-- School-scoped table uses.
alter table public.sms_log alter column school_id set default public.app_current_school_id();

-- Backfill: every row inserted before this migration came from the cron.
update public.sms_log set kind = 'absence_auto' where rule_id is not null;

create index sms_log_school_batch_idx on public.sms_log (school_id, batch_id);
create index sms_log_school_created_idx on public.sms_log (school_id, created_at);

-- record_absence_sms gains a batch id (one per rule per run, so same-day
-- candidates for one rule group into a single log row) and a segment count,
-- and now returns the inserted row's id (null on a deduped conflict) so the
-- caller can update its status once the actual send attempt completes.
-- NOTE: this is the first migration to drop+recreate an existing RPC rather
-- than stay purely additive — Postgres won't let CREATE OR REPLACE change a
-- function's return type (boolean -> uuid here). Every caller is updated in
-- this same commit (app/api/sms/absence/route.ts, tests/integration/absence-sms.test.ts).
drop function if exists public.record_absence_sms(text, uuid, uuid, uuid, date, text, text, text);

create function public.record_absence_sms(
  job_secret text,
  p_school uuid,
  p_student uuid,
  p_rule uuid,
  p_sent_on date,
  p_phone text,
  p_body text,
  p_provider text,
  p_batch uuid default gen_random_uuid(),
  p_segments int default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;
  insert into sms_log (school_id, student_id, rule_id, sent_on, phone, body, provider, kind, batch_id, segments)
  values (p_school, p_student, p_rule, p_sent_on, p_phone, p_body, p_provider, 'absence_auto', p_batch, p_segments)
  on conflict (student_id, rule_id, sent_on) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- The cron records the attempt optimistically as 'sent' (so a normal run
-- makes exactly one write per candidate); this flips it to 'failed' after an
-- actual gateway.send() failure.
create function public.set_sms_log_status(job_secret text, p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid status';
  end if;
  update sms_log set status = p_status where id = p_id;
end $$;

revoke execute on function public.record_absence_sms(text, uuid, uuid, uuid, date, text, text, text, uuid, int) from public;
revoke execute on function public.set_sms_log_status(text, uuid, text) from public;
grant execute on function public.record_absence_sms(text, uuid, uuid, uuid, date, text, text, text, uuid, int) to anon, authenticated;
grant execute on function public.set_sms_log_status(text, uuid, text) to anon, authenticated;
