-- 0102_pbac_authorize.sql
-- PBAC (master_prd.md doc 006): combine an RBAC permission with the tenant's
-- feature availability (subscription-driven). Allowed iff role grants the
-- permission AND (no feature required OR the feature is enabled for the school).
create or replace function public.app_authorize(p_permission text, p_school uuid default null, p_feature text default null)
  returns boolean language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  ok := public.app_has_permission(p_permission);
  if not ok then return false; end if;
  if p_feature is null then return true; end if;
  return public.app_feature_enabled(coalesce(p_school, public.app_current_school_id()), p_feature);
end;
$$;
