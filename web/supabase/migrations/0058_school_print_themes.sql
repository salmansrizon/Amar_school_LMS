-- Admit card colour presets (issue #94, map #91, docs/improvement.md §1):
-- a school picks one curated palette as its default; a single print run can
-- deviate via URL param without persisting anything.
--
-- Keyed by document type on purpose (map #91 fog-grilling, 2026-07-23). Only
-- 'admit-card' is themed today — mark sheets and result books stay monochrome
-- — but adding a printable later is inserting a row, not altering the schema,
-- and the theme does not collide with #92's header columns on `schools`.

create table public.school_print_themes (
  school_id uuid not null references public.schools (id) on delete cascade
    default public.app_current_school_id(),
  doc_type text not null,
  -- A key from lib/print-themes.ts's curated list, not a colour: the presets
  -- are what enforce the doc's "professional and consistent appearance".
  palette_key text not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, doc_type),
  constraint school_print_themes_doc_type_known check (doc_type in ('admit-card'))
);

alter table public.school_print_themes enable row level security;

-- Readable by every school member (printables need it), writable by the Owner
-- only — it is institute configuration, same as the print header.
create policy "school members read print themes" on public.school_print_themes
  for select using (school_id = public.app_current_school_id());
create policy "owner manages print themes" on public.school_print_themes
  for all using (
    school_id = public.app_current_school_id() and public.app_current_role() = 'school_owner'
  );
create policy "super admin manages print themes" on public.school_print_themes
  for all using (public.app_current_role() = 'super_admin');
