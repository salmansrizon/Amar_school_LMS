---
status: accepted
supersedes: ADR-0017
---

# Class attachment governs reading, and the anchor authorises the reply

ADR 0017 introduced the second axis — **class attachment** — alongside the Permission Grant, and named three surfaces that enforced less than the rule. Two of those move to Row Level Security here (migration 0152), and one line of 0017 turns out to be wrong in practice. This ADR restates the whole rule so there is one place to read it, rather than a rule plus an amendment.

## The axes, restated in full

A **Permission Grant** says which *screens* a Staff User may open. It says nothing about *which Students* they may reach. **Class attachment** answers the second question, and is read from data the school already maintains rather than from a new switch:

- **Class Teacher** of a Class — `classes.class_teacher_id` points at your `employees` row. Full authority over that Class's Students: their leave, their questions, their notices, their materials.
- **Subject Teacher** of a Class — you appear in that Class's routine (`routine_slots.teacher_id`). You may teach it, and you decide nothing *about the children* in it.
- **Neither** — office staff. No contact with any student account, whatever Grants they hold.

Both axes must pass for a school-wide surface. For a Class Teacher acting **on her own Class**, the attachment alone is sufficient and no Grant is required — an Owner who assigns Karim Sir to 6-A has already said what they mean, and requiring a second switch only creates a silent, student-facing way to forget.

## What is new: attachment governs *reading*

0017 was written about who may **act**. `0148_student_messages.sql` and `0149_profile_correction_requests.sql` had already shipped the opposite for **reading** — `school_id = app_current_school_id()` for select on both tables, with 0148's comment presenting it as deliberate owner oversight ("there is no unmonitored adult-to-child channel here"). Once the three surfaces merge into one section (#509), those two positions cannot both stand: the section would show an accounts clerk every child's question in the school.

Resolved: **only the School Owner sees everything.**

| Actor | Reads | Replies / acts |
| --- | --- | --- |
| School Owner | every question and request in the school | replies; sole applier of a correction |
| Class Teacher | their own classes (`classes.class_teacher_id`) | replies for their own classes |
| Subject Teacher | **questions** for classes they teach (`routine_slots.teacher_id`), plus anything anchored to work they set. **No correction requests at all** — see below | replies **only** where the anchor is their own subject or their own publication |
| Office staff (neither axis) | nothing student-facing | nothing |

This *tightens* 0148's read policy rather than inheriting it. Owner oversight survives intact — the Owner still reads every question — but oversight was never an argument for the clerk in the front office reading them.

## What is amended: the anchor authorises the reply

0017 says a Subject Teacher "decides nothing about the children" in a Class they teach, and lists "no answering questions" among the consequences. That produces a relay:

> A student asks "why is question 4 due Thursday?" — a question about a specific task, anchored to the publication that set it. Under 0017 the Subject Teacher who set that task can see it and may not answer. The Class Teacher may answer and does not know. So she walks down the corridor and asks him.

The relay is the defect, and it is not a small one: the response-performance table (#455) measures exactly the latency it introduces, and blames the Class Teacher for it.

**A Subject Teacher may answer a question anchored to their own subject or their own publication, and nothing else.** They still decide nothing *about the child* — no leave, no correction, no profile change. They decide about the work they set. A question anchored to a colleague's subject is refused at the database even when the row is plainly visible to them, because they teach the class it came from.

### Authorship counts as attachment — but only for someone who has one

`publications.created_by` is a **login**, not an employee, so "did you publish this?" says nothing on its own about class attachment: an office staff member holding the `notices` grant can publish a school-wide notice. Taking authorship alone as sufficient would have handed them every question asked about that notice, across every Class — directly contradicting the rule three paragraphs above, which says office staff read nothing student-facing.

So the publication branch of the anchor is guarded: **the caller must already hold a class attachment somewhere.** A teacher who set the work answers for it; an office clerk who published a notice does not, and questions about it fall to the Class Teacher and the Owner as they did before this ADR. The Subject-Teacher branch needs no such guard — appearing in a routine *is* an attachment.

This is also why the read predicate carries the anchor branch and not only the three capacities: a school-wide post reaches Classes its author does not teach, and a reply grant that points at a row the replier cannot fetch is not a grant.

## Enforcement status of the three surfaces 0017 named

| Surface | 0017 | Now |
| --- | --- | --- |
| Student leave | app code only (`requireSchoolMember`) | **still app code** — unchanged here; the workflow approver override (ADR 0016 / #452) owns it |
| `publications` | no Grant at all | **still no Grant** — unchanged here |
| Profile corrections | owner-only in a definer function | **RLS**: read by attachment (0152), apply still owner-only in `apply_profile_change_request` |
| Student questions | not named — 0148 shipped after | **RLS**: read by attachment, reply by attachment or anchor (0152) |

Two of the four are now enforced at the database rather than by which page issued the query. Leave and publications remain open, deliberately: this ADR is about the two student-facing queues that #509 merges, and widening it to cover leave would have meant touching the workflow engine in the same migration.

## The `feedback` grant key

#509 gives the merged section **no screen key and no feature key**. `feedback` is both, and a hub riding it would take student questions down with guardian feedback whenever a school switched that feature off. #510 hides guardian feedback from the sidebar and from search; its routes, tables, `feedback` grant, `feedback` feature key and all its i18n stay.

So `feedback` survives as a grant key with no visible nav entry. That is deliberate and temporary: hiding is a nav decision, meant to read as a one-line reversal. The key is **not** to be reused for the merged section, and **not** to be dropped while the routes still exist — a dropped key would silently widen `/school/feedback` from "granted staff only" to "anyone who types the URL". If guardian feedback is ever removed rather than hidden, the key goes with the routes in the same change.

## What this ADR did NOT fix: the accounting

The relay above is justified by the response-performance table (#455) — it measures the latency the relay introduces and blames the Class Teacher for it. **This ADR fixes the relay and leaves the accounting exactly as it was.**

`lib/student/response-performance.ts` still accounts every question to the Class Teacher of the asking Student's Class, "not to whoever happened to reply". So after this ADR:

- A Subject Teacher who answers forty questions about his own Subject gets **no row of his own**. The report keys on Class Teacher, and he only ever appears if he is one somewhere. He sees the school-wide Σ and nothing else.
- A Class Teacher is still credited with, and still blamed for, questions a colleague answered or failed to answer — which is the blame this ADR claims to have removed.

`student_messages.replied_by` is written on every reply, so the data to fix it exists. The likely shape is: account an **answered** question to whoever replied, an **unanswered** one to the Class Teacher — which preserves the stated reason for the current rule ("an unanswered question has no replier, and *who should have answered this* is what the Owner is asking") while stopping a Class Teacher being credited with a colleague's work.

It is not done here because none of #508/#509/#510 asks for it, and it rewrites the meaning of a screen the School Owner already uses. It has its own ticket on map #434. Recorded here so the gap is not mistaken for an oversight by whoever reads this ADR next.

## Consequences

- **Office staff see an empty section by design.** #509 ships a fallback line explaining why rather than a blank page — a Subject Teacher whose routine has not been entered resolves to no classes and would otherwise be told nothing.
- **A Class Teacher with no login still decides nothing** — `employees.profile_id` is null, so no session resolves to her, and her students' questions fall to the School Owner.
- **Two hats are normal**, and the strongest one wins: a teacher who is Class Teacher of 6-A and teaches 9-B holds `class_teacher` in 6-A and `subject_teacher` in 9-B. The capacity is resolved per Student, never per person.
- **The rule lives in one function.** `staff_class_capacity_for_student(uuid)` returns `owner` / `class_teacher` / `subject_teacher` / `null`, and both read policies and the reply policy call it. A rule copied into four policy expressions drifts in three of them.

## Considered and rejected

- **Leaving reads school-wide and scoping in the page query.** The section would have been correct and the API would not — RLS is the authority in this codebase, and "which page issued the query" is not an access control mechanism.
- **A separate `student-questions` screen key for the hub.** Every school would have had to re-grant it, and it would have re-created the coupling #509 exists to remove.
- **Extending the anchor rule to corrections.** A correction request is about the child, not about anybody's coursework; there is no anchor to authorise anything, and a Subject Teacher applying one would be exactly what 0017 forbids.
- **Letting a Subject Teacher read the correction queue for classes he teaches.** He cannot act on one — only the Owner applies — so the reach buys him nothing, and it costs the child's guardian phone number, blood group, religion and home address. This map set a stricter bar than that for the child's *own* profile: 0131's `student_self` hides `guardian_nid` and `sibling_info` behind a definer view so they are absent rather than merely unselected. He opens an empty Corrections tab, and #509's empty-scope line explains it.
