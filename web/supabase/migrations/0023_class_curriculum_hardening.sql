-- Class & Curriculum I hardening (issue #26). Additive on top of the
-- already-applied class_curriculum DDL:
-- 1) a class is identified by name + section within a school (legacy shape);
-- 2) rooms carry an active flag (mockup status column, seat-plan filtering);
-- 3) subjects may belong to a class (mockup lists subjects per class);
--    nullable so pre-existing school-wide catalogue rows stay valid.

alter table public.classes
  add constraint class_name_section_unique unique nulls not distinct (school_id, name, section);

alter table public.rooms
  add column is_active boolean not null default true;

alter table public.subjects
  add column class_id uuid references public.classes (id) on delete cascade;

create index subjects_class_idx on public.subjects (class_id);
