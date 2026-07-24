-- Multi-tenant T4 (issue #111): super-admin B2B panel support —
--   1. time-boxed trials (start_trial + redefined subscription status),
--   2. owner email lookup for the super-admin-triggered password reset.

-- (1) Redefine "trial" from never-paid (open-ended) to a time-boxed demo window.
-- A school with no code history now expires when its trial expiry lapses;
-- a school that never had a trial set (no expiry) stays open-ended trial, so
-- existing never-touched schools do not silently flip to expired.
create or replace function public.school_subscription_status(sid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  has_history boolean;
  expiry date;
begin
  if not (
    public.app_current_role() = 'super_admin'
    or public.app_current_school_id() = sid
    or public.school_reachable_by_me(sid)
  ) then
    raise exception 'not allowed';
  end if;

  select exists (select 1 from subscription_codes where redeemed_school_id = sid) into has_history;
  select subscription_expires_at into expiry from schools where id = sid;

  if not has_history then
    -- Open-ended trial when no window was ever set; otherwise the window clocks.
    if expiry is null then
      return 'trial';
    end if;
    return case when expiry >= current_date then 'trial' else 'expired' end;
  end if;

  -- Paid schools: active while the paid expiry holds, else expired.
  if expiry is not null and expiry >= current_date then
    return 'active';
  end if;
  return 'expired';
end $$;

-- (1b) Super-admin grants a time-boxed trial: sets the expiry N days out.
-- Consumes no subscription code, so the school stays "trial" until it lapses.
create function public.start_trial(sid uuid, days int default 15) returns date
language plpgsql security definer set search_path = public as $$
declare
  new_expiry date;
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'only a Super Admin can start a trial';
  end if;
  if days not between 1 and 365 then
    raise exception 'trial length must be between 1 and 365 days';
  end if;
  if not exists (select 1 from schools where id = sid) then
    raise exception 'unknown school';
  end if;
  new_expiry := current_date + days;
  update schools set subscription_expires_at = new_expiry where id = sid;
  return new_expiry;
end $$;

revoke execute on function public.start_trial(uuid, int) from anon, public;
grant execute on function public.start_trial(uuid, int) to authenticated;

-- (2) Owner email for the super-admin-triggered password reset. Reads auth.users
-- (super-admin has no service-role key), so it is a security-definer lookup
-- gated to super-admin; returns null when no owner is bound yet.
create function public.school_owner_email(sid uuid) returns text
language plpgsql stable security definer set search_path = public, auth as $$
declare
  em text;
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'only a Super Admin can read an owner email';
  end if;
  select u.email into em
  from profiles p
  join auth.users u on u.id = p.id
  where p.school_id = sid and p.role = 'school_owner'
  limit 1;
  return em;
end $$;

revoke execute on function public.school_owner_email(uuid) from anon, public;
grant execute on function public.school_owner_email(uuid) to authenticated;
