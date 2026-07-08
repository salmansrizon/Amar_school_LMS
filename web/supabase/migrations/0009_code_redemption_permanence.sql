-- Redemption is permanent: once a code is used, its redemption fields are
-- immutable (a WITH CHECK can't compare OLD/NEW, so this needs a trigger).
-- Also bound decrease_expiry's months to the same 1-24 range as validity.

create function public.protect_code_redemption() returns trigger
language plpgsql as $$
begin
  if old.redeemed_at is not null
     and (new.redeemed_at is distinct from old.redeemed_at
          or new.redeemed_school_id is distinct from old.redeemed_school_id) then
    raise exception 'a redeemed code''s redemption is permanent';
  end if;
  return new;
end $$;

create trigger code_redemption_permanent
  before update on public.subscription_codes
  for each row execute function public.protect_code_redemption();

create or replace function public.decrease_expiry(sid uuid, months int) returns date
language plpgsql security definer set search_path = public as $$
declare
  expiry date;
begin
  if public.app_current_role() <> 'super_admin' then
    raise exception 'only a Super Admin can correct expiry dates';
  end if;
  if months not between 1 and 24 then
    raise exception 'months must be between 1 and 24';
  end if;
  if not exists (select 1 from subscription_codes where redeemed_school_id = sid) then
    raise exception 'not available for a Trial School (no code history)';
  end if;

  select subscription_expires_at into expiry from schools where id = sid for update;
  if expiry is null or expiry < current_date then
    return expiry; -- already expired: no observable effect
  end if;

  expiry := expiry - make_interval(months => months);
  update schools set subscription_expires_at = expiry where id = sid;
  return expiry;
end $$;
