-- 0096_notification_from_template.sql
-- Render a bn/en template + insert an in-app notification in one definer RPC
-- (map #258, #267/#271). Lets a system caller (anon + reconcile secret) notify
-- without a session that can read the authenticated-only templates table. bn is
-- the default language; {{placeholders}} are interpolated from p_data.
create or replace function public.notification_from_template(
  p_recipient uuid, p_school uuid, p_template_key text, p_data jsonb, job_secret text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare tpl record; ttl text; bdy text; k text; v text; n_id uuid;
begin
  if not (public.app_current_role() = 'super_admin' or public.is_super_or_system(job_secret)
          or public.app_tenant_member(p_school)) then
    raise exception 'not authorized to notify';
  end if;
  select title, body into tpl from public.notification_templates where key = p_template_key;
  if not found then raise exception 'unknown notification template: %', p_template_key; end if;
  ttl := coalesce(tpl.title->>'bn', tpl.title->>'en', '');
  bdy := coalesce(tpl.body->>'bn', tpl.body->>'en', '');
  for k, v in select key, value from jsonb_each_text(coalesce(p_data, '{}'::jsonb)) loop
    ttl := replace(ttl, '{{' || k || '}}', v);
    bdy := replace(bdy, '{{' || k || '}}', v);
  end loop;
  insert into public.notifications (recipient_id, school_id, title, body)
  values (p_recipient, p_school, ttl, bdy) returning id into n_id;
  return n_id;
end;
$$;
