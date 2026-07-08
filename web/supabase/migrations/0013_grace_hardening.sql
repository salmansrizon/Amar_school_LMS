-- Greploop hardening for issue #9:
-- 1. employee_shifts RLS must also verify the SHIFT belongs to the caller's
--    school (a foreign shift UUID could otherwise widen an employee's grace).
-- 2. Index the join path on shift_id.
-- 3. One-call effective grace for the whole school (kills the page's N+1).

create index employee_shifts_shift_idx on public.employee_shifts (shift_id);

create function public.shift_in_my_school(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from shifts where id = sid and school_id = public.app_current_school_id()
  )
$$;

drop policy "school members manage employee shifts" on public.employee_shifts;
create policy "school members manage employee shifts" on public.employee_shifts
  for all using (
    public.employee_in_my_school(employee_id) and public.shift_in_my_school(shift_id)
  )
  with check (
    public.employee_in_my_school(employee_id) and public.shift_in_my_school(shift_id)
  );

create function public.effective_grace_for_my_school()
returns table (employee_id uuid, grace int)
language sql stable security definer set search_path = public as $$
  select e.id,
         greatest(
           coalesce(s.default_grace_minutes, 0),
           coalesce(c.grace_minutes, 0),
           coalesce(e.grace_override_minutes, 0),
           coalesce((
             select max(sh.grace_minutes)
             from employee_shifts es join shifts sh on sh.id = es.shift_id
             where es.employee_id = e.id
           ), 0)
         )
  from employees e
  join schools s on s.id = e.school_id
  left join category_grace_minutes c
    on c.school_id = e.school_id and c.category = e.category
  where e.school_id = public.app_current_school_id()
$$;

revoke execute on function public.effective_grace_for_my_school() from anon, public;
grant execute on function public.effective_grace_for_my_school() to authenticated;
