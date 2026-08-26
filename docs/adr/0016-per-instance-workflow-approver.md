# A workflow instance may name its own approver

The Workflow engine authorises a decision against `workflow_stages`, which is per-*definition*: a stage names either an `approver_role` or one fixed `approver_user`. The Student Portal (map #434) needs approvals routed to **the class teacher of this student's class** — a relationship, not a role and not a fixed user. Class Teacher is deliberately not a role of its own (#435: an ordinary Staff User login), so neither existing column can express it.

We add `workflow_instances.approver_user_override`, resolved when the instance starts, and `workflow_decide` accepts it alongside the stage's own approver. The School Owner remains an accepted approver in all cases.

## Why extend rather than route around it

`web/AGENTS.md` requires features to consume the engines rather than re-implement approval per feature. A bespoke status column plus a one-off predicate would have been a smaller diff for the first case, but this shape occurs at least twice on this map — student leave requests (#452) and profile correction requests (#456) — and both would otherwise grow their own approval logic. The gap is a real capability hole in the engine, not a reason to bypass it.

## Considered and rejected

- **Leave the approver as `school_owner`** (the current `leave_approval` config) — zero work, but in an 800-student school the Owner would approve every sick note, which in practice means requests rot unanswered.
- **`approver_role = 'staff_user'`** — needs no engine change, but lets any staff member approve any student's request, and `workflow_decide` runs as definer above RLS, so the UI cannot tighten it.
- **A second definition per class teacher** — unbounded definitions, one per teacher per school.
