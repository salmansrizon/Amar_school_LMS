-- 0153_answered_invariant.sql
-- Architecture review, candidate 1: "answered" is one fact stored in two
-- columns, and nothing made the two agree.
--
-- `student_messages.status = 'answered'` and `replied_at is not null` are two
-- spellings of the same domain fact. The application read them inconsistently —
-- the inbox and the status rails asked `status`, the response report asked
-- `replied_at` — and NOTHING in the schema tied them together. Every row in the
-- project disagreed: four questions showing as answered in the teacher's inbox
-- were reported by উত্তরের অবস্থা as "0 answered, 4 waiting".
--
-- The application half is `isAnswered()` in lib/student/messages.ts, which reads
-- both columns and is now the single definition. This is the database half: it
-- stops new rows drifting, so that one definition stays cheap to hold.
--
-- Additive only — staging and main share one project.

-- ---------------------------------------------------------------------------
-- 1. Where the drift comes from.
--
-- `answerQuestion` (lib/student/messages-source.ts) has always written
-- reply_body, replied_by, replied_at and status together, so the product never
-- produced a half-answered row. But 0148's update policy grants UPDATE on the
-- table, not on a function — so any authenticated client holding the reply
-- right can PATCH `{status: 'answered'}` and omit the timestamp, and several of
-- this repo's own integration tests do exactly that. RLS is the authority
-- (README), so the invariant has to live next to the grant rather than in the
-- one code path that happens to respect it.
--
-- A trigger rather than a rejection: a caller marking a question answered has
-- said the true thing, and refusing them because they left out a bookkeeping
-- column would be pedantry. Stamp it and move on.
create or replace function public.stamp_student_message_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Answering without saying when: record when.
  if new.status = 'answered' and new.replied_at is null then
    new.replied_at := now();
  end if;

  -- A reply body is evidence of a reply, whatever the status says. This is the
  -- same tolerance isAnswered() applies on the read side.
  if new.reply_body is not null and coalesce(old.reply_body, '') is distinct from new.reply_body then
    new.status := 'answered';
    new.replied_at := coalesce(new.replied_at, now());
  end if;

  return new;
end $$;

drop trigger if exists student_message_reply_stamp on public.student_messages;
create trigger student_message_reply_stamp
  before update on public.student_messages
  for each row execute function public.stamp_student_message_reply();

revoke execute on function public.stamp_student_message_reply() from public;
revoke execute on function public.stamp_student_message_reply() from anon;

-- ---------------------------------------------------------------------------
-- 2. Backfill — in the one direction that invents nothing.
--
-- `replied_at is not null` but `status <> 'answered'` is fully recoverable: the
-- timestamp proves the reply happened and the status is simply stale. Safe.
--
-- The other direction is NOT backfilled, deliberately. For a row marked answered
-- with no timestamp, the reply genuinely happened and the time was never
-- recorded — there is no honest value to write. `created_at` would report a
-- zero-hour reply and flatter every median it touches; `now()` would report the
-- question as having taken however long ago it was asked. Both are fabrications
-- that would land in a report a School Owner uses to talk to a teacher about
-- their work.
--
-- So those rows stay as they are, `isAnswered()` counts them as answered, and
-- responseReport() leaves them out of the median rather than timing them. See
-- tests/unit/answered.test.ts, "does not invent a reply time it does not have".
update public.student_messages
   set status = 'answered'
 where replied_at is not null
   and status <> 'answered';

-- ---------------------------------------------------------------------------
-- 3. The constraint, in the direction the backfill just made true.
--
-- NOT VALID would be the cautious choice, but the backfill above has already
-- brought every existing row into line with this exact predicate, so validating
-- now is safe and gives the guarantee immediately. The reverse implication
-- (answered ⇒ timestamped) is deliberately NOT a constraint: it would reject the
-- historical rows section 2 explains, and the trigger already makes it true for
-- everything written from here on.
alter table public.student_messages
  drop constraint if exists student_message_reply_is_answered;
alter table public.student_messages
  add constraint student_message_reply_is_answered
  check (replied_at is null or status = 'answered');

comment on constraint student_message_reply_is_answered on public.student_messages is
  'A recorded reply time implies the answered status. The converse is enforced by the student_message_reply_stamp trigger rather than by a constraint, because rows predating 0153 have the status without the time and no honest value exists to backfill.';
