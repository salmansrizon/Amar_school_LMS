-- 0156_expiry_reminder_stops_reaching_students.sql
-- Map #434 / audit fix: students were reading their school's billing reminders.
--
-- 0069 recorded the 7-day expiry reminder as a `publications` notice with
-- target_type = 'all'. That was written when only staff could read publications.
-- #434 gave Students a read policy on exactly that table, so since the portal
-- shipped every Student of a school has been able to read "your EdumeBD
-- subscription expires on … Please renew to avoid interruption."
--
-- The notice was always the third copy of this message: the sweep also sends the
-- Owner an SMS and publishes SubscriptionExpiringSoon, whose notification
-- consumer drops an in-app notice in the Owner's inbox (#267) — both gated on
-- the same `p_owner is not null`. So the fix is to stop writing the publication
-- rather than to invent a staff-only audience for one row.
--
-- The reminder claim (subscription_expiry_reminders) is untouched: it is what
-- makes the sweep idempotent.

create or replace function public.record_subscription_reminder(
  job_secret text,
  p_school uuid,
  p_expires_on date,
  p_owner uuid,
  p_title text,
  p_body text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  claimed int;
begin
  if not exists (select 1 from vendor_secrets where key = 'reconcile' and value = job_secret) then
    raise exception 'invalid job secret';
  end if;

  insert into subscription_expiry_reminders (school_id, expires_on)
  values (p_school, p_expires_on)
  on conflict (school_id, expires_on) do nothing;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    return false; -- already reminded for this expiry window
  end if;

  -- p_title / p_body are kept in the signature: the caller still passes them,
  -- the SMS still uses them, and changing the signature would need the old
  -- overload dropped first on a database two branches share.
  return true;
end $$;

-- Retire the reminders already published. They are billing messages sitting in
-- every student's notice list right now; the Owner's inbox notification carries
-- the same content, so nothing is lost by removing them.
delete from public.publications
 where kind = 'notice'
   and title = 'Subscription expiring soon';
