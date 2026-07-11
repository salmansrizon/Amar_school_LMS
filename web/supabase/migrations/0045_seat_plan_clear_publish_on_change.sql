-- Code-review fix for issue #47 (Exams II): publish_seat_plan (0044 migration)
-- server-side-validates duplicate-range/overlap before stamping
-- exams.seat_plan_published_at, but nothing invalidated that stamp again once
-- rows changed afterward — a school could publish, then edit/regenerate the
-- seat plan (reintroducing an overlap or moving past capacity) while the UI
-- kept showing "Published" and the disabled Publish button skipped the
-- authoritative re-check. Any write to exam_seat_plans now clears the parent
-- exam's publish marker, forcing a fresh publish_seat_plan call (and its
-- overlap check) before "Published" can be true again. Additive only.

create function public.clear_seat_plan_publish_on_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update exams set seat_plan_published_at = null
  where id = coalesce(new.exam_id, old.exam_id) and seat_plan_published_at is not null;
  return coalesce(new, old);
end $$;

-- after, not before: this only reacts to a write that already succeeded past
-- enforce_exam_seat_plan_school (capacity/tenancy/closed-exam checks) —
-- generate_seat_plan's delete-then-insert cycle fires it too, which is
-- correct: regenerating should also require a fresh publish.
create trigger exam_seat_plan_clear_publish
  after insert or update or delete on public.exam_seat_plans
  for each row execute function public.clear_seat_plan_publish_on_change();
