-- 0130_student_role_enum.sql
-- Map #434 / ticket #441. Adds the 'student' app_role value, and nothing else.
--
-- It is alone in its own migration on purpose: 0131 relaxes the
-- profiles.school_scoping CHECK to name 'student' as a literal, and Postgres
-- refuses to *use* an enum value added in the same transaction. 0109 dodged this
-- by never comparing against the new value; this map cannot, so the two are
-- split across files (each migration file runs in its own transaction).
--
-- Numbering: this map deliberately starts at 0130, leaving 0120-0129 free for
-- the in-flight #503/#504 work, so the two branches never contend for a filename
-- or an apply order on the shared Supabase project.

alter type public.app_role add value if not exists 'student';
