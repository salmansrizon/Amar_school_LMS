-- 0256_student_message_body_length.sql
-- Issue #703 item 5.5: a length limit on a question's text.
-- DRAFT: written by an agent, applied by hand after review. One CHECK
-- constraint, added NOT VALID. No row is rewritten or deleted. Safe to run
-- twice.
--
-- WHAT
--   CHECK student_message_body_length: char_length(body) <= 4000 on
--   student_messages. The app applies the same number in validateQuestion
--   (QUESTION_BODY_MAX in lib/student/messages.ts) and shows a counter.
--
-- WHY
--   The question body had no limit at all.
--
-- CHOICES
--   * 4000 characters: about two pages of text, counted on the stored
--     Markdown. Change the number here and in QUESTION_BODY_MAX together.
--   * The first reply (reply_body) is not limited here: it is written by
--     staff, and limiting it could refuse an update of an old long reply.
--
-- NOT VALID, AND WHAT THAT MEANS
--   Existing rows are not checked when the constraint is added, so adding it
--   cannot fail. But Postgres does check a NOT VALID constraint whenever a row
--   is inserted OR UPDATED. A teacher answering an old question longer than
--   4000 characters would therefore be refused. RUN THE PRE-CHECK: if it
--   returns 0, apply as written. If it returns rows, do not apply this file;
--   raise the number (here and in the app) above the longest body first.
--
-- WHO MAY READ / WRITE WHAT
--   No policy changes.
--
-- EFFECT ON EXISTING DATA
--   None stored. See NOT VALID above for the one way an existing row can be
--   affected.
--
-- THE APP BEFORE AND AFTER
--   The app enforces 4000 itself, before and after. This constraint only stops
--   a direct API write from going past it.
--
-- PRE-CHECK (read-only; expect over_limit = 0)
--   select count(*) filter (where char_length(body) > 4000) as over_limit,
--          max(char_length(body)) as longest
--     from student_messages;
--
-- ROLLBACK
--   alter table public.student_messages drop constraint if exists student_message_body_length;

alter table public.student_messages drop constraint if exists student_message_body_length;
alter table public.student_messages
  add constraint student_message_body_length check (char_length(body) <= 4000) not valid;

comment on constraint student_message_body_length on public.student_messages is
  'Question text is at most 4000 characters (#703 item 5.5). NOT VALID: rows older than 0256 were not checked.';

notify pgrst, 'reload schema';
