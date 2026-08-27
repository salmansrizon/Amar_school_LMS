---
status: superseded by ADR-0018
supersedes: ADR-0016
---

> **Superseded by [ADR 0018](0018-the-anchor-authorises-the-reply.md).** The two
> axes stand; 0018 restates them in full and changes two things. Class attachment
> now governs *reading* as well as acting (migration 0152 moves the two
> student-facing queues to RLS), and a Subject Teacher **may** answer a question
> anchored to their own subject or their own publication — reversing the "no
> answering questions" line below, which forced every such question through the
> Class Teacher as a relay. Read 0018 rather than this file.

# Two axes govern a Staff User's reach: a Grant, and a class attachment

A Permission Grant says which *screens* a Staff User may open. It says nothing about *which students* they may act on, and until now nothing did — so any staff member could approve any child's leave and post a notice to any class. Map #434 needed the missing half and reached for the Workflow engine (ADR 0016); that was the wrong shape, because posting a notice is not an approval and the engine has no vocabulary for who may *create* a thing.

We instead add a second axis, **class attachment**, read from data the school already maintains rather than from a new switch:

- **Class Teacher** of a Class — `classes.class_teacher_id` points at your `employees` row. Full authority over that Class's students: their leave, their questions, their notices, their materials.
- **Subject Teacher** of a Class — you appear in that Class's routine (`routine_slots.teacher_id`). You may teach it — study materials and class notices — and decide nothing about the children in it.
- **Neither** — office staff. No direct contact with any student account, whatever Grants they hold.

Both axes must pass for a school-wide surface. For a Class Teacher acting **on her own Class**, the attachment alone is sufficient and no Grant is required.

## Why the attachment alone is enough for a Class Teacher

An Owner who assigns Karim Sir to 6-A has already said what they mean. Requiring them to then find a permissions screen and flip `attendance` adds a step that gets forgotten — and the failure is silent and student-facing: questions sit unanswered and the portal looks broken to a child. The assignment is the intent; the switch would only be a second chance to get it wrong.

Grants remain the only mechanism for office staff, who have no attachment to lean on, and for every school-wide surface.

## Consequences

- **School-wide notices** (`publications.target_type = 'all'`) belong to the School Owner and to office staff holding `notices`. A Class Teacher cannot address all 800 families; her reach is her Class.
- **Two hats are normal.** A teacher who is Class Teacher of 6-A and teaches 9-B has full authority in 6-A and materials-and-notices only in 9-B. The axes are evaluated per Class, never per person.
- **A Class Teacher with no login still decides nothing** — `employees.profile_id` is null, so no session ever resolves to her. Those students' questions and requests fall to the School Owner, as they do today.
- Three surfaces currently enforce less than this: student leave is checked in app code only (`requireSchoolMember`), `publications` carries no Grant at all, and profile corrections are owner-only in a definer function. All three move to the two-axis rule, which tightens two of them and widens the third.

## Considered and rejected

- **ADR 0016's per-instance workflow approver** — decided but never built, and its two named consumers both went elsewhere (#452 shipped a status column, #456 shipped owner-only). It also could not have covered notices at all.
- **Grant-only, no class scoping** — one switch and no new concept, but a part-time teacher holding `attendance` could approve leave for a child she has never taught.
- **A new teacher-to-class assignment table** — unnecessary; `routine_slots.teacher_id` already records exactly this and the Routine screen already maintains it.
