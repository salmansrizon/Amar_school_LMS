-- Feedback module (issue #38, PRD §5.9): aggregated per-institute/per-app
-- satisfaction ratings + an inbound question/feedback inbox with
-- unread/read/answered states and email reply. No parent portal exists yet
-- (out of scope, map issue #24) so inbound items are logged by School staff
-- on behalf of however the guardian actually reached them (phone/in-person/
-- paper) — the same pattern behaviour_log_entries already uses for incidents
-- reported by non-logged-in parties. Additive only.

create table public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  sender_name text not null,
  sender_role text,
  sender_contact text,
  sender_email text,
  subject text not null,
  body text not null,
  status text not null default 'unread'
    check (status in ('unread', 'read', 'answered')),
  reply_body text,
  replied_by uuid references public.profiles (id),
  replied_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index feedback_messages_school_idx on public.feedback_messages (school_id);
create index feedback_messages_status_idx on public.feedback_messages (school_id, status);

alter table public.feedback_messages enable row level security;
create policy "school members manage feedback_messages" on public.feedback_messages
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages feedback_messages" on public.feedback_messages
  for all using (public.app_current_role() = 'super_admin');

-- replied_by points at profiles, which is school-scoped — verify tenancy past
-- RLS, same as enforce_student_subject_school / enforce_class_ref_school.
create function public.enforce_feedback_reply_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.replied_by is not null and not exists (
    select 1 from profiles where id = new.replied_by and school_id = new.school_id
  ) then
    raise exception 'replied_by does not belong to this school';
  end if;
  return new;
end $$;

create trigger feedback_message_replied_by_same_school
  before insert or update on public.feedback_messages
  for each row execute function public.enforce_feedback_reply_school();

-- Per-institute vs per-application ratings (PRD §5.9 says "aggregated
-- per-institute and per-application"): 'institute' rows belong to one School;
-- 'application' rows are platform-wide (school_id null) — schema support
-- only, no vendor-side aggregate UI ships in this ticket (not mocked; the
-- strict UI reference for #38 is school-owner only).
create table public.satisfaction_ratings (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'institute' check (scope in ('institute', 'application')),
  school_id uuid references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  overall_rating smallint not null check (overall_rating between 1 and 5),
  category_teaching smallint check (category_teaching between 1 and 5),
  category_facilities smallint check (category_facilities between 1 and 5),
  category_communication smallint check (category_communication between 1 and 5),
  category_safety smallint check (category_safety between 1 and 5),
  sender_name text,
  created_at timestamptz not null default now(),
  constraint scope_school_pairing check ((scope = 'institute') = (school_id is not null))
);
create index satisfaction_ratings_school_idx on public.satisfaction_ratings (school_id);

alter table public.satisfaction_ratings enable row level security;
create policy "school members manage satisfaction_ratings" on public.satisfaction_ratings
  for all using (scope = 'institute' and school_id = public.app_current_school_id());
create policy "super admin manages satisfaction_ratings" on public.satisfaction_ratings
  for all using (public.app_current_role() = 'super_admin');
