-- 0095_school_owner_resolver.sql
-- Resolve a school's owner (map #258, #271 notification wiring). System/super or
-- the tenant itself; used by the event-driven notification consumer to address
-- an InvoicePaid notice to the owner.
create or replace function public.school_owner_id(p_school uuid, job_secret text default null)
  returns uuid language plpgsql stable security definer set search_path = public as $$
declare oid uuid;
begin
  if not (public.is_super_or_system(job_secret) or public.app_tenant_member(p_school)) then
    raise exception 'not authorized';
  end if;
  select id into oid from public.profiles where school_id = p_school and role = 'school_owner' limit 1;
  return oid;
end;
$$;
