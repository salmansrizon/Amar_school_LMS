-- 0089_notification_engine.sql
-- Notification Engine (map #258, ticket #267). Templated, multi-channel (in-app /
-- sms / email), config-driven by domain event. This lands the reusable
-- primitives: templates (bn/en), an event->channel map, and an in-app inbox with
-- its push/read RPCs. SMS/email dispatch reuses the existing lib/sms + lib/email
-- gateways from the TS engine.
--
-- Scope note: existing direct sends (absence SMS, expiry reminders) keep working
-- as-is — rewiring live send paths onto events risks behavior/cost and is a
-- separate ticket. Per-event recipient resolution wires up as #269/#270 features
-- land. Nothing here sends automatically yet.

create table public.notification_templates (
  key text primary key,
  title jsonb not null default '{}'::jsonb,   -- {bn, en} with {{placeholders}}
  body jsonb not null default '{}'::jsonb
);

create table public.notification_channel_map (
  event_type text not null,
  channel text not null check (channel in ('in_app', 'sms', 'email')),
  template_key text not null references public.notification_templates (key),
  primary key (event_type, channel)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  school_id uuid references public.schools (id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at);

alter table public.notification_templates enable row level security;
alter table public.notification_channel_map enable row level security;
alter table public.notifications enable row level security;

create policy "authenticated reads notification_templates" on public.notification_templates
  for select using (auth.uid() is not null);
create policy "super admin manages notification_templates" on public.notification_templates
  for all using (public.app_current_role() = 'super_admin');
create policy "authenticated reads notification_channel_map" on public.notification_channel_map
  for select using (auth.uid() is not null);
create policy "super admin manages notification_channel_map" on public.notification_channel_map
  for all using (public.app_current_role() = 'super_admin');

-- Recipients read + mark their own in-app notifications; super-admin sees all.
create policy "recipient reads own notifications" on public.notifications
  for select using (recipient_id = auth.uid());
create policy "super admin reads notifications" on public.notifications
  for select using (public.app_current_role() = 'super_admin');
create policy "recipient updates own notifications" on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Seed a couple of templates + their in-app channel mapping.
insert into public.notification_templates (key, title, body) values
  ('invoice_generated',
   '{"bn":"নতুন ইনভয়েস","en":"New invoice"}',
   '{"bn":"ইনভয়েস {{number}} — মোট {{total}}","en":"Invoice {{number}} — total {{total}}"}'),
  ('invoice_paid',
   '{"bn":"পেমেন্ট নিশ্চিত","en":"Payment confirmed"}',
   '{"bn":"ইনভয়েস {{number}} পরিশোধিত","en":"Invoice {{number}} is paid"}'),
  ('workflow_completed',
   '{"bn":"অনুরোধ সম্পন্ন","en":"Request completed"}',
   '{"bn":"আপনার অনুরোধের ফলাফল: {{status}}","en":"Your request outcome: {{status}}"}');

insert into public.notification_channel_map (event_type, channel, template_key) values
  ('InvoiceGenerated', 'in_app', 'invoice_generated'),
  ('InvoicePaid', 'in_app', 'invoice_paid'),
  ('WorkflowCompleted', 'in_app', 'workflow_completed');

-- Push an in-app notification (super/system). Recipient resolution is the
-- caller's responsibility (domain-specific).
create or replace function public.notification_push(
  p_recipient uuid, p_school uuid, p_title text, p_body text, job_secret text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare n_id uuid;
begin
  if not public.is_super_or_system(job_secret) then
    raise exception 'not authorized to push notifications';
  end if;
  insert into public.notifications (recipient_id, school_id, title, body)
  values (p_recipient, p_school, p_title, p_body) returning id into n_id;
  return n_id;
end;
$$;

-- Mark one of the caller's own notifications read.
create or replace function public.notification_mark_read(p_id uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = now() where id = p_id and recipient_id = auth.uid();
end;
$$;
