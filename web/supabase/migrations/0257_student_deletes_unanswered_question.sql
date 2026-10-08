-- 0257_student_deletes_unanswered_question.sql
-- Issue #703 item 5.8: a Student can withdraw their own unanswered question.
-- DRAFT: written by an agent, applied by hand after review. One new policy.
-- No row is rewritten or deleted by this file. Safe to run twice.
--
-- WHAT
--   A DELETE policy on student_messages for the Student who asked, while the
--   question has no reply.
--
-- WHY
--   A question sent by mistake could not be withdrawn.
--
-- CHOICES (product decision taken the conservative way)
--   * Only while unanswered: status is not 'answered', and reply_body and
--     replied_at are both null (the same three facts isAnswered() reads).
--     Once a teacher has replied, the exchange stays.
--   * A question a teacher has merely opened (status 'read') can still be
--     withdrawn.
--   * No delete for School roles is added here (0172 notes there is none).
--
-- WHO MAY READ / WRITE WHAT
--   The policy is `student_id = app_current_student_id()` plus the unanswered
--   test, so a Student can delete only rows that are their own; another
--   Student's question never matches. app_current_student_id() is null for
--   anyone who is not an active Student, so the policy matches nothing for
--   staff or anon.
--
-- WHAT GOES WITH A DELETED QUESTION
--   * student_message_reads rows (0255): ON DELETE CASCADE.
--   * student_message_replies rows (0254): ON DELETE CASCADE, but there are
--     none, because a further reply needs a first reply.
--   * Follow-ups pointing at it (0253 thread_id): ON DELETE SET NULL; they
--     stay.
--   This file does not depend on 0253-0255 being applied.
--
-- EFFECT ON EXISTING DATA
--   None by itself. From then on a Student may delete their own unanswered
--   questions; the School loses sight of a withdrawn question (no audit copy
--   is kept).
--
-- THE APP BEFORE AND AFTER
--   Before: the delete matches no row and the app says the question could not
--   be withdrawn. After: the question is removed.
--
-- PRE-CHECK (read-only)
--   -- 1. No delete policy for Students yet (expect no row with cmd DELETE):
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'student_messages' order by cmd, policyname;
--   -- 2. How many questions are withdrawable right now, for the record:
--   select count(*) from student_messages
--    where status <> 'answered' and reply_body is null and replied_at is null;
--
-- ROLLBACK
--   drop policy if exists "student withdraws own unanswered question" on public.student_messages;

drop policy if exists "student withdraws own unanswered question" on public.student_messages;
create policy "student withdraws own unanswered question" on public.student_messages
  for delete using (
    student_id = public.app_current_student_id()
    and status <> 'answered'
    and reply_body is null
    and replied_at is null
  );

notify pgrst, 'reload schema';
