-- 0172_a_subject_can_be_deleted_and_its_questions_go_with_it.sql
-- Issue #548, found while running the suite during map #524.
--
-- A subject could not be deleted once any student had asked a question about
-- it, by anyone except the Super Admin. Three rules met and contradicted:
--
--   1. student_messages.subject_id was ON DELETE SET NULL,
--   2. student_message_has_anchor (ADR 0018) forbids a message with neither a
--      subject nor a post — an anchor-less question can never be authorised for
--      a reply, so it must not exist,
--   3. student_messages has no DELETE policy for any school role.
--
-- The cascade nulled the anchor, the check rejected it, and the subject delete
-- raised a constraint error naming a table the Owner has never heard of.
--
-- The decision is CASCADE, and the reason is consistency with what deleting a
-- subject already does. exam_marks, student_subjects and exam_subject_teachers
-- have cascaded from this FK since 0031 — the product already accepts that
-- removing a subject removes a student's *marks* in it. A question about a
-- subject that no longer exists is strictly less valuable than a mark, and by
-- ADR 0018 it is unanswerable the moment its anchor goes: nobody can be
-- authorised to reply to it.
--
-- Considered and rejected:
--
--   * RESTRICT with a friendly message. Honest, and a dead end: the Owner is
--     told they may not tidy their catalogue and given nothing to do about it,
--     forever, because no school role can delete the question either.
--   * Re-anchor the question to the class, or to a tombstone subject. Keeps the
--     record at the cost of a new concept, and leaves a question whose subject
--     line reads "(deleted)" in a student's history.
--   * Give the Owner a delete on student_messages. Orthogonal and probably
--     wanted anyway, but on its own it turns one blocked delete into two.
--
-- What does NOT change: the anchor rule itself. A message still cannot exist
-- without one — this only decides what happens to the message when its anchor
-- is removed on purpose.
alter table public.student_messages
  drop constraint if exists student_messages_subject_id_fkey;

alter table public.student_messages
  add constraint student_messages_subject_id_fkey
  foreign key (subject_id) references public.subjects (id) on delete cascade;

comment on constraint student_messages_subject_id_fkey on public.student_messages is
  'CASCADE, not SET NULL: student_message_has_anchor forbids an anchor-less message, so nulling the subject made every subject with a question undeletable (#548).';
