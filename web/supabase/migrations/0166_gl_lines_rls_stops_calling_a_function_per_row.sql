-- 0166_gl_lines_rls_stops_calling_a_function_per_row.sql
-- Map #524, found by #542's negative-access test timing out at 15s.
--
-- #530 moved the trial balance into the database, which was right — the page had
-- been folding a 1000-row truncation of a 46,521-row table and rendering a
-- phantom ৳2,800 imbalance. But aggregating the whole table exposed what the
-- truncation had been hiding: `read visible gl_lines` calls
-- gl_entry_visible(entry_id), a SECURITY DEFINER function, and Postgres cannot
-- inline one. So the predicate ran 47,096 times, once per row.
--
-- The same aggregate with no RLS runs in 18ms. With it, a School Owner's trial
-- balance did not return inside fifteen seconds.
--
-- The rewrite is semantically identical, not merely similar:
--
--   was: exists (select 1 from gl_entries e
--                 where e.id = entry_id and app_tenant_member(e.school_id))
--   and: app_tenant_member(s) = app_current_role() = 'super_admin'
--                                or (s is not null and s = app_current_school_id())
--
--   now: (select app_current_role()) = 'super_admin'
--        or exists (select 1 from gl_entries e
--                    where e.id = entry_id and e.school_id = (select app_current_school_id()))
--
-- The one behavioural difference is that a super_admin no longer needs the
-- referenced entry to exist — and gl_lines.entry_id is a foreign key, so it
-- always does.
--
-- What makes it fast is the `(select ...)` wrapping: both helpers take no
-- arguments and are STABLE, so wrapped they are hoisted into an InitPlan and
-- evaluated once per query instead of once per row. What remains is a primary-key
-- lookup on gl_entries. 0150 §2 established this pattern; this policy predates it.
--
-- Fixes every reader of gl_lines, not just the trial balance.

drop policy if exists "read visible gl_lines" on public.gl_lines;

create policy "read visible gl_lines" on public.gl_lines
  for select
  using (
    (select public.app_current_role()) = 'super_admin'
    or exists (
      select 1
        from public.gl_entries e
       where e.id = entry_id
         and e.school_id = (select public.app_current_school_id())
    )
  );

-- The lookup above is by primary key, but the school_id filter is not covered by
-- it. One index turns the per-row probe into an index-only scan.
create index if not exists gl_entries_id_school_idx on public.gl_entries (id, school_id);
