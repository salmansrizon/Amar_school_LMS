-- 0155_submission_object_cleanup_via_storage_api.sql
-- Map #434 / audit fix: withdrawing homework never worked.
--
-- 0142 deleted the storage object from a trigger (`delete from storage.objects`).
-- The platform forbids that — storage.objects carries its own `protect_delete()`
-- trigger that raises "Direct deletion from storage tables is not allowed. Use
-- the Storage API instead." The raise aborted the whole statement, so the
-- homework_submissions row never went either: every withdrawal failed, for
-- students and for service-role alike, and the raw English message was rendered
-- into the Bangla student UI.
--
-- The object is now removed through the Storage API by withdrawSubmission, next
-- to the upload that put it there (the rollback path in submit-work.tsx already
-- used the API). The student delete policy on storage.objects that 0142 created
-- is what authorizes it, so nothing here needs to change.

drop trigger if exists homework_submission_object_cleanup on public.homework_submissions;
drop function if exists public.drop_submission_object();
