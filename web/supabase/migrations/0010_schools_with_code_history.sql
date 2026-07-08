-- Distinct redeemed-school ids in one call — avoids fetching every code row
-- (PostgREST truncates large result sets, which would mislabel schools as Trial).
create function public.schools_with_code_history() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct redeemed_school_id from subscription_codes
  where redeemed_school_id is not null
$$;

revoke execute on function public.schools_with_code_history() from anon, public;
grant execute on function public.schools_with_code_history() to authenticated;
