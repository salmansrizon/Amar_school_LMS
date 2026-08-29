-- Unknown supply/customer combinations are still explicitly pending rather
-- than silently resolving to no configuration.

create or replace function public.tax_treatment_resolve(
  p_supply_type text,
  p_customer_type text default 'school',
  p_effective_date date default current_date
) returns table(status text, rate_bp integer, inclusive boolean, source_reference text)
language sql stable security definer set search_path = public as $$
  select coalesce(t.status, 'pending'), coalesce(t.rate_bp, 0), coalesce(t.inclusive, false), t.source_reference
  from (select 1) fallback
  left join lateral (
    select c.status, c.rate_bp, c.inclusive, c.source_reference
    from public.tax_treatment_config c
    where c.supply_type = p_supply_type
      and c.customer_type = p_customer_type
      and (c.effective_from is null or c.effective_from <= p_effective_date)
      and (c.effective_to is null or c.effective_to >= p_effective_date)
      and c.status <> 'retired'
    order by c.effective_from desc nulls last
    limit 1
  ) t on true
$$;
