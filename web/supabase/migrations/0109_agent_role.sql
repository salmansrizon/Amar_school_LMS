-- 0109_agent_role.sql
-- #271: give field agents their own login role + app group. Agents already exist
-- as agent_assignments rows under a distributor; this adds the app_role value so
-- they can authenticate into a gated /agent surface, plus the policy-engine
-- role/permission and a narrow RLS grant letting an assignee complete their task.

-- New enum value. RENAME/ADD VALUE is fine here because nothing in THIS migration
-- compares against the 'agent' literal (roles table keys are plain text, the RLS
-- grant is auth.uid()-based), so the "can't use a new enum value in the same
-- transaction" restriction doesn't apply.
alter type public.app_role add value if not exists 'agent';

-- Policy-engine role + its app-group access permission (mirrors distributor).
insert into public.roles (key, label)
  values ('agent', '{"bn":"এজেন্ট","en":"Agent"}')
  on conflict (key) do nothing;
insert into public.permissions (key, description)
  values ('agent.access', 'Access the Agent app group')
  on conflict (key) do nothing;
insert into public.role_permissions (role_key, permission_key)
  values ('agent', 'agent.access')
  on conflict (role_key, permission_key) do nothing;

-- An agent is a task's assignee, not its owning distributor, so today they can
-- only SELECT it ("assignee reads task"). Let them flip their own task's status
-- (open/done) — the with-check keeps the row theirs.
create policy "assignee updates own task" on public.partner_tasks
  for update using (assignee_id = auth.uid()) with check (assignee_id = auth.uid());

-- RLS can't scope an UPDATE to a single column, and the policy above would let an
-- assignee who is NOT the owning distributor rewrite title/due_at via the REST
-- API. This trigger confines a pure-assignee update to the status column; the
-- owning distributor (managed by its own policy) keeps full edit rights.
create function public.enforce_assignee_task_scope() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = new.assignee_id and auth.uid() is distinct from new.distributor_id then
    if new.title is distinct from old.title
       or new.due_at is distinct from old.due_at
       or new.assignee_id is distinct from old.assignee_id
       or new.distributor_id is distinct from old.distributor_id
       or new.created_at is distinct from old.created_at then
      raise exception 'assignees may only change task status';
    end if;
  end if;
  return new;
end $$;

create trigger partner_tasks_assignee_scope
  before update on public.partner_tasks
  for each row execute function public.enforce_assignee_task_scope();

-- Reserve the new 'agent' subdomain (0063 ran already; 0107 last recreated this
-- with 'distributor'). Keep 'dealer' + 'distributor' reserved too.
create or replace function public.is_valid_subdomain(slug text) returns boolean
language sql immutable set search_path = public as $$
  select slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
     and slug !~ '--'
     and char_length(slug) between 3 and 63
     and slug <> all (array[
       'admin','agent','api','app','assets','auth','blog','cdn','dealer','distributor','dev','docs',
       'gov','help','login','mail','preview','reset-password','school','signup',
       'staging','static','status','super-admin','support','vercel','www'
     ])
$$;
