-- 0071_super_admin_sms_log.sql
-- Super-admin broadcast SMS to schools (map #158, ticket #165). The per-school
-- sms_log (0021/0055) is school-scoped (school_id not null), so a cross-school
-- vendor broadcast does not fit it; this is a separate, vendor-side audit log of
-- each broadcast send (one row per compose, not per recipient).

create table public.super_admin_sms_log (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations (id) on delete set null,
  body text not null,
  recipient_count int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.super_admin_sms_log enable row level security;

create policy "super admin manages broadcast sms log" on public.super_admin_sms_log
  for all using (public.app_current_role() = 'super_admin');
