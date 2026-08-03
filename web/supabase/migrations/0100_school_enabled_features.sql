-- 0100_school_enabled_features.sql
-- Feature-gating enforcement layer (map #258, #263/#271): resolve every enabled
-- feature key for a school in one call, for gating a whole nav/menu at render
-- without N per-item round-trips. Tenant/super/system gated.
create or replace function public.school_enabled_features(p_school uuid, job_secret text default null)
  returns setof text language plpgsql stable security definer set search_path = public as $$
declare fk text;
begin
  if not (public.is_super_or_system(job_secret) or public.app_tenant_member(p_school)) then
    raise exception 'not authorized';
  end if;
  for fk in select key from public.features loop
    if public.app_feature_enabled(p_school, fk) then
      return next fk;
    end if;
  end loop;
end;
$$;
