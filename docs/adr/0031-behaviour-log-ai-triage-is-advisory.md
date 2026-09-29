# Behaviour Log AI triage is advisory, stored beside the entry, and off by default

**Status**: accepted

A Behaviour Log Entry's note is judged by TypeSafe (a System One model) for three things: severity (Score, five levels), whether a teacher would contact the guardian (Noul), and category (Choice: bullying, absence, academic, conduct, positive, none). Application code turns those judgments into read-only hints on the Student profile, including a warning when the entered rating points the opposite way to the note — shown only while the entry is still editable, before the 3-day lock (issue #672).

The judgments are **advice, never decisions**. Nothing reads them to change the entry or rating, send SMS, set reminders, or feed the progress report, the Student portal or guardian text. Every threshold lives in `lib/behaviour-triage.ts`; the model supplies only the typed answers. The rating is deliberately not sent, so severity is judged from the note alone and the mismatch check compares two independent signals.

The result lives in its own table, `behaviour_entry_triage`, keyed by entry, not in columns on `behaviour_log_entries`. That keeps the AI from ever writing to the Student's record and keeps the 3-day lock trigger out of the advisory write's way. Its RLS delegates to the entry's own RLS (a triage row is reachable exactly when its entry is), so the owner / Class Teacher / grant / Student rules are not restated and cannot drift. A `note_sha256` column marks advice made on an older version of the note, which the UI hides.

The call is synchronous (one attempt, 2 s) after the entry is saved, and fails open: timeout, API error, a missing `TYPESAFE_API_KEY` or a refused write all leave the saved entry untouched and simply produce no advice. Synchronous so the mismatch warning is on screen while the teacher can still act on it; the architecture's general preference for queued AI work is set aside for one bounded, non-blocking call.

The per-school `behaviour_ai_triage` flag (`school_feature_flags`, absent row = off) gates the external call itself: with the flag off, no note leaves the platform. Passing tests are not grounds to enable it. Enabling for any School first needs the labelled eval (`npm run eval:behaviour-triage`, Bangla / mixed / English) reviewed and a separate privacy review — the notes concern minors and are processed by a third party (TypeSafe DPA, zero-data-retention option, disclosure to the School).

## Considered options

- **Columns on `behaviour_log_entries`.** Rejected: the AI would write to the Student's record, and updates would run into the lock trigger after 3 days.
- **Queue the call / Next `after()`.** Rejected for now: advice would arrive after the page renders, so the mismatch warning would often not be seen before the entry locks.
- **Ask the model whether the rating fits the note (a Noul with the number in state).** Rejected: numbers in the prompt are a weak signal for the model; comparing an independent severity against `ratingBand` in code is explicit and testable.
- **Service-role write of triage rows.** Not done: a staff member can forge advice for an entry they can already edit, which changes nothing but the hint they see. Revisit if the hint ever gains weight.

## Consequences

- Thresholds are code constants, to be tuned against the eval before any School is switched on; UI configuration of them is out of scope.
- Existing entries have no advice (no backfill). Advice appears for entries created or edited while the flag is on.
- Switching a School's flag off hides existing advice as well as stopping new calls.
