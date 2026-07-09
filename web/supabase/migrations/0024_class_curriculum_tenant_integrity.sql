-- Class & Curriculum I review fixes (issue #26 / PR #52):
-- 1) room names are unique per school (the UI already promised this);
-- 2) a subject's class must belong to the subject's own school — composite FK
--    replaces the single-column FK from class_curriculum_hardening, closing a
--    cross-tenant cascade-delete path (RLS does not guard FK cascades).

alter table public.rooms
  add constraint room_name_unique unique (school_id, name);

alter table public.classes
  add constraint classes_id_school_unique unique (id, school_id);

alter table public.subjects
  drop constraint subjects_class_id_fkey;

alter table public.subjects
  add constraint subjects_class_same_school
    foreign key (class_id, school_id) references public.classes (id, school_id)
    on delete cascade;
