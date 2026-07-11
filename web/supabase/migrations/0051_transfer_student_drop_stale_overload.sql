-- 0048_exam_marks.sql added transfer_student(..., p_new_roll int default null),
-- but `create or replace function` only replaces a function of the exact same
-- signature — a different arg list creates a second overload instead. The
-- original 5-arg version (from 0036) is now ambiguous to PostgREST alongside
-- the 6-arg version whenever a caller omits p_new_roll (every existing call
-- site), causing PGRST203 "Could not choose the best candidate function".
-- Drop the stale 5-arg overload; the 6-arg version (p_new_roll defaulting to
-- null) is a strict superset and keeps every existing caller's behavior.

drop function if exists public.transfer_student(uuid, text, text, uuid, text);
