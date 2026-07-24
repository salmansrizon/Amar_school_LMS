-- Activity Checklist as an editable template (ui.md issue 4 / map #140 #150).
--
-- Was: a fixed set of 5 boolean columns on daily_checklists, hardcoded in
-- lib/institute.ts. School owners asked to manage the list themselves — add,
-- edit, delete and reorder items — with the dashboard showing the current
-- template each day to tick off.
--
-- So the items become school-scoped master data (activity_checklist_items),
-- and a day's tick state moves off the fixed columns into a jsonb map keyed by
-- item id (daily_checklists.ticks). Pre-launch, so the old boolean columns and
-- their historical demo data are dropped outright rather than migrated.

create table public.activity_checklist_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  label_bn text not null,
  label_en text not null,
  -- Ordering the owner controls (reorder); ties fall back to created_at.
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index activity_checklist_items_school_idx
  on public.activity_checklist_items (school_id, sort_order, created_at);

alter table public.activity_checklist_items enable row level security;
create policy "school members manage activity_checklist_items" on public.activity_checklist_items
  for all using (school_id = public.app_current_school_id());
create policy "super admin manages activity_checklist_items" on public.activity_checklist_items
  for all using (public.app_current_role() = 'super_admin');

-- Seed every existing school with the previous fixed 5 as its starting
-- template, preserving their old order.
insert into public.activity_checklist_items (school_id, label_bn, label_en, sort_order)
select s.id, d.label_bn, d.label_en, d.sort_order
from public.schools s
cross join (values
  ('পতাকা উত্তোলন করা হয়েছে', 'Flag hoisted', 0),
  ('জাতীয় সংগীত পরিবেশিত হয়েছে', 'National anthem rendered', 1),
  ('সমাবেশ অনুষ্ঠিত হয়েছে', 'Assembly held', 2),
  ('সময়মতো ক্লাস শুরু হয়েছে', 'Classes started on time', 3),
  ('প্রাঙ্গণ পরিষ্কার করা হয়েছে', 'Premises cleaned', 4)
) as d(label_bn, label_en, sort_order);

-- Tick state: item_id -> true for the items checked that day. Replaces the
-- fixed boolean columns.
alter table public.daily_checklists add column ticks jsonb not null default '{}'::jsonb;
alter table public.daily_checklists
  drop column flag_hoisted,
  drop column anthem_rendered,
  drop column assembly_held,
  drop column classes_started_on_time,
  drop column premises_cleaned;
