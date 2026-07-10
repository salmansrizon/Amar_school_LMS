-- Size column for the syllabus list (mockup's "Size" column). Nullable:
-- rows uploaded before this column simply show a dash. Additive only.
alter table public.class_syllabi add column if not exists file_size bigint
  check (file_size is null or file_size > 0);
