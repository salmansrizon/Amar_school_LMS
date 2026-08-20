-- 0105_workflow_leave_sync.sql
-- Leave approval via the Workflow engine (master_prd.md doc 007) without touching
-- the attendance-correctness SQL (0046) that reads student_leaves.status: when a
-- leave_approval workflow completes, sync the decision onto the leave's status.
create or replace function public.workflow_leave_sync() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.definition_key = 'leave_approval'
     and new.status in ('approved', 'rejected')
     and old.status is distinct from new.status then
    if new.entity_type = 'student_leave' then
      update public.student_leaves set status = new.status where id = new.entity_id::uuid;
    elsif new.entity_type = 'employee_leave' then
      update public.employee_leaves set status = new.status where id = new.entity_id::uuid;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists workflow_leave_sync_trg on public.workflow_instances;
create trigger workflow_leave_sync_trg after update of status on public.workflow_instances
  for each row execute function public.workflow_leave_sync();
