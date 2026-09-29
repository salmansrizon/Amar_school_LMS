-- Advisory AI triage for Behaviour Log Entries (issue #672).
--
-- One row per entry holding TypeSafe's typed judgments of the entry's note:
-- severity (Score), guardian-contact probability (Noul) and category (Choice).
-- The row is advice for staff only. Nothing reads it to change the entry, the
-- rating, the progress report, SMS or reminders.
--
-- A separate table rather than columns on behaviour_log_entries, for two
-- reasons: the AI never writes to the Student's record, and the 3-day lock
-- trigger on that table stays out of the way of the advisory write.
--
-- note_sha256 is the hash of the note the judgments were made on. An edit
-- replaces the row; if a replacement fails, the stale row is hidden by the app
-- because its hash no longer matches the current note.
--
-- Gated per school by the 'behaviour_ai_triage' school_feature_flags row
-- (absent row = off). No flag seed here: every school starts off.

create table public.behaviour_entry_triage (
  entry_id uuid primary key references public.behaviour_log_entries (id) on delete cascade,
  note_sha256 text not null check (note_sha256 ~ '^[0-9a-f]{64}$'),
  model text not null,
  severity numeric not null check (severity between 0 and 4),
  severity_confidence numeric not null check (severity_confidence between 0 and 1),
  severity_probs jsonb not null,
  parent_contact_p numeric not null check (parent_contact_p between 0 and 1),
  category text not null
    check (category in ('bullying', 'absence', 'academic', 'conduct', 'positive', 'none')),
  category_confidence numeric not null check (category_confidence between 0 and 1),
  category_probs jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.behaviour_entry_triage enable row level security;

-- A triage row is reachable exactly when its entry is. The subquery runs under
-- the caller's own RLS on behaviour_log_entries (not security definer), so this
-- inherits every rule there — owner / Class Teacher with the students or exams
-- grant, Super Admin, and no Student or Subject Teacher — without restating it.
create policy "triage follows its behaviour log entry" on public.behaviour_entry_triage
  for all
  using (exists (select 1 from public.behaviour_log_entries e where e.id = entry_id))
  with check (exists (select 1 from public.behaviour_log_entries e where e.id = entry_id));
