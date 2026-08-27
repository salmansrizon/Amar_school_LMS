---
status: accepted
amends: ADR-0018
---

# Response Performance accounts a question to whoever answered it

ADR 0018 removed the relay that made a Subject Teacher walk down the corridor to have a Class Teacher answer a question about his own subject. It did not touch the report that measures the relay, and said so under "What this ADR did NOT fix: the accounting". This is that fix.

**An answered question is accounted to whoever replied. An unanswered one is accounted to the Class Teacher of the asking Student's Class.**

The split preserves the reason the old rule existed — an unanswered question has no replier, and *who should have answered this* is the question the Owner is asking — while stopping a Class Teacher being credited with, and blamed for, a colleague's work. A Subject Teacher who answers forty questions about his own subject now has a row; before this he had none, and saw only the school-wide Σ.

## The consequence worth knowing before you read the screen

A question **moves between rows** the moment somebody answers it. A Class Teacher's total can therefore *fall* between two readings of the same date window, and nobody did anything wrong: her waiting question became his answered one.

That is the honest reading of a per-person report, but it changes what the first column means. It stopped being "questions from my class" (`Received`, মোট প্রশ্ন) and became "questions on me as things now stand" (`Accountable`, দায়িত্বে). The row header stopped being **Class Teacher** and became **Teacher**, because the rows now hold Subject Teachers and the School Owner too.

## Considered and rejected

- **Counting the question for both** — received by the Class Teacher, answered by the replier. Rows stop being disjoint, the per-row totals stop summing to the school's, and for a teacher the Σ row comes from a separate definer RPC (`school_question_timings`, 0152) that would visibly disagree with the rows above it. A table whose own arithmetic does not close is worse than one whose rows move.
- **Windowing answered rows by `replied_at`** so a week shows the week's replies. The metric is measured from `created_at` and the Σ RPC filters on it server-side, so this would have split one question across two windows or dropped it from both, and dragged a second migration into the change. "What did my staff do this week" is a different report, not this one bent into shape.
- **Leaving an unmapped replier with the Class Teacher.** A reply records a login; a login with no `employees` row behind it is the School Owner, because every other actor who may reply holds a class attachment and an attachment is read off an Employee record (ADR 0018). Folding her replies back onto the Class Teacher would have re-created exactly the blame this removes.
- **Putting the Owner's replies in the unassigned bucket.** That bucket means *a Class with no Class Teacher* — nobody was accountable. Collapsing it with *the Owner answered it herself* would make the one number she is looking at wrong in her own favour. She gets her own row.

## Consequences

- **A Subject Teacher's "still waiting" column is structurally always empty.** The unanswered half still keys on Class Teacher, so a question can never be waiting *on him*. Correct per ADR 0018 — he answers about the work he set; he is not accountable for the class — but it will look like a bug to someone who does not know the rule.
- **Questions answered before this shipped stay with the Class Teacher.** `replied_by` has only been written since #454, and a row answered through a bare PATCH carries no replier at all. Those fall back to the old rule rather than being guessed at. Every question in the project on the day this shipped was in that state.
- **`employee_card` gained `profile_id`** (migration 0156). The report keys on `employees.id`; a reply records `profiles.id`; the mapping has to be readable by a teacher who does not hold the Employees grant. The alternative was a second SECURITY DEFINER function making the same fact reachable by a longer route.
- **The report is still not a league table.** Rows remain ordered by name, never by any metric. Nothing here adds a score, a target or an escalation, and #455's binding constraint is unchanged.
