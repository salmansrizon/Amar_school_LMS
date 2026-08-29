-- 0154_answered_stamp_on_insert.sql
-- Follow-up to 0153, from the /code-review pass over it.
--
-- 0153 says its trigger "stops new rows drifting". It does not, quite: it is
-- BEFORE UPDATE only, so a row INSERTED with status='answered' and no
-- replied_at is never stamped.
--
-- Who can do that: not a Student — 0148's insert policy pins status='unread'
-- and reply_body is null. Not staff — 0148 gives them no insert policy at all.
-- Only `super admin manages student messages` (0148, `for all`, no WITH CHECK)
-- and a service-role connection, and this project deliberately has no
-- service-role key. So the practical exposure is nil today.
--
-- It is fixed anyway, because the gap is between the trigger and its own stated
-- purpose, and a comment claiming an invariant that the code does not hold is
-- how 0148's "staff read every question" comment came to contradict the policy
-- beneath it — the exact drift ADR 0018 was written to clean up.
--
-- Additive only — staging and main share one project.

create or replace function public.stamp_student_message_reply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Answering without saying when: record when. True on INSERT and UPDATE alike.
  if new.status = 'answered' and new.replied_at is null then
    new.replied_at := now();
  end if;

  -- A reply body is evidence of a reply, whatever the status says — the same
  -- tolerance isAnswered() applies on the read side.
  --
  -- UPDATE only, and not merely because `old` is unassigned on INSERT: the
  -- question is "did this write introduce a reply", which on INSERT is already
  -- answered by the branch above.
  if tg_op = 'UPDATE'
     and new.reply_body is not null
     and coalesce(old.reply_body, '') is distinct from new.reply_body then
    new.status := 'answered';
    new.replied_at := coalesce(new.replied_at, now());
  end if;

  return new;
end $$;

drop trigger if exists student_message_reply_stamp on public.student_messages;
create trigger student_message_reply_stamp
  before insert or update on public.student_messages
  for each row execute function public.stamp_student_message_reply();

revoke execute on function public.stamp_student_message_reply() from public;
revoke execute on function public.stamp_student_message_reply() from anon;

-- ---------------------------------------------------------------------------
-- Not fixed here, and named so it is not mistaken for an oversight.
--
-- Clearing `reply_body` back to NULL on an already-answered row leaves
-- status='answered' and replied_at set, so a retracted reply still reads as
-- answered everywhere. No product path does this — `answerQuestion` only ever
-- writes a reply — and the state does not violate 0153's constraint, which is
-- about replied_at implying the status.
--
-- Left alone deliberately: "retraction" is not a concept this product has, and
-- inventing one inside a trigger would be a worse answer than the gap. If a
-- retraction feature is ever wanted, it needs a decision about what the Student
-- sees, not a rollback rule hidden here.
comment on function public.stamp_student_message_reply() is
  'Keeps status and replied_at telling the same story on insert and update (isAnswered, lib/student/messages.ts). Does not handle reply retraction — see 0154.';
