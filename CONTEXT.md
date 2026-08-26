# Amar School Management (Web Rebuild)

A multi-tenant school management platform, distributed through a reseller network, being rebuilt from a legacy Java Swing desktop app + MySQL into a modern web application. Covers both the school-facing product and the vendor/distributor business that sells and licenses it.

## Language

**School**:
One educational institution using the platform — a tenant. Corresponds to a row in the legacy `company` table.
_Avoid_: Company, client, tenant (in user-facing text — "tenant" is fine in architecture docs)

**School Owner**:
The primary account for a School; full access to all of that School's modules and data. Corresponds to the legacy `users` row linked to a `company`.
_Avoid_: Admin (ambiguous with Vendor Admin), principal

**Staff User**:
A restricted-permission login belonging to a School, created by the School Owner for an employee, scoped to specific modules/pages. Corresponds to the legacy `sub_user` table.
_Avoid_: Sub-user, employee login

**Distributor**:
An external reseller business assigned one or more Territories, who sells Subscription Codes to Schools within those Territories and earns commission on what those Schools pay. Each Territory assignment carries its own tier (Division/Zilla/Upazila/Union) — tier is a property of the *assignment*, not the Distributor as a whole, since one Distributor can hold assignments at different levels simultaneously. Tier is descriptive/organizational only (labeling, filtering) — it does not drive pricing, commission, or code-purchase permissions; territory-scoping alone controls what a Distributor can sell into. In the legacy system, Distributors are records managed entirely by the Super Admin — they have no login of their own. The web rebuild adds genuine Distributor self-service (login, buy code batches) as new functionality, not preserved parity. A Distributor may employ one or more Agents (see Agent).
_Avoid_: Dealer (legacy term — use only when describing the legacy system), Partner (survives in the `/super-admin/partners` route and `partner_tasks` table; never in user-facing text), Vendor

**Agent**:
A field person employed by one Distributor to do on-the-ground work for the Schools in that Distributor's Territory — onboarding visits, training, support tasks. An Agent is created by their Distributor and starts life awaiting Super Admin approval; only an approved Agent is active. An Agent belongs to exactly one Distributor and is managed from that Distributor's profile, never as a top-level platform entity. Distinct from a Distributor: the Distributor is the reselling business, the Agent is a person working under it.
_Avoid_: Dealer, sub-dealer, rep, field officer

**Certification**:
A dated credential held by an Agent (name, certificate number, issue date, expiry date, evidence document) that the Super Admin verifies. Validity is time-boxed — normally one year — after which the Agent must submit renewal evidence and be re-approved. An Agent may hold several Certifications at once; expiry is per-Certification, not per-Agent.
_Avoid_: License, accreditation, qualification

**Discount Agreement**:
A standing, school-bound, time-boxed reduction in a School's monthly bill, whose *cost is shared* between the platform and the School's Distributor at an agreed ratio (50/50, 30/70, …). Requested by the Distributor, approved by the Super Admin, and thereafter applied automatically to every monthly invoice inside its validity window. Distinct from a promo code (redeemed by whoever holds it, no owner, no shared cost) and from a Subscription Code (a prepaid instrument that buys validity, not a reduction). The agreed ratio is what makes the discount a joint investment in the sale rather than a platform giveaway: the Distributor's share is deducted from the Distributor's commission payable for that invoice.
_Avoid_: Coupon, promo, quote, special pricing

**Commission**:
The Distributor's earning on one School invoice, calculated on the invoice's **gross** (list) amount — never on the discounted amount. Where a Discount Agreement applies, the Distributor's share of that discount is then deducted from this figure to give the Distributor's net payable. The governing identity, true of every invoice: *collected = distributor payable + platform net*.
_Avoid_: Margin, cut, share (ambiguous with discount share), payout (that is a Settlement)

**Task**:
A unit of field work assigned by a Distributor to one of its Agents for a School — an onboarding visit, a training session, a support call — carrying a deadline and completed by the Agent marking it done in their own portal. Tasks are financial data as well as operational: the proportion completed by deadline within a settlement period scales the Distributor's commission for that period. Completing one late recovers the withheld amount in the following period.
_Avoid_: Ticket, job, activity, visit

**Settlement**:
The single netted statement of what the platform owes a Distributor for one period, and the payment that clears it. Builds up from commission per source invoice, minus Discount Agreement shares, minus the Distributor's own unpaid invoices (SMS packs, code batches, Certification fees), adjusted by task completion, plus any recoveries from earlier periods. One per Distributor per period. A negative net is carried forward, not written off.
_Avoid_: Payout, remittance, commission payment (each names only one part of it)

**Territory**:
A geographic area (built from the legacy 4-level `location` hierarchy: Zone/Division → District → Upozilla → Union) assigned to a Distributor or Government Official, defining which Schools they can sell to / oversee. A Distributor or Government Official can hold **multiple** Territory assignments at once (e.g. two separate Unions) — assignment is a list, not a single field. "Extended School access" (an individual out-of-territory School grant) is not a separate mechanism: it's the same kind of assignment, just pointing at one School instead of a location node — but it must be visually flagged as such wherever that School appears in the assignee's Schools list (e.g. an "Extended access" badge), so it's never indistinguishable from a normal in-territory School.
_Avoid_: Area, region, zone (unless referring to a specific level in the location hierarchy)

**Super Admin**:
The software vendor's own operator role, with full control of the platform: manages Schools, Distributors, Agents, Government Officials, Subscription Codes, and vendor-side accounting. In the legacy system this was a single shared hardcoded secret key (no per-person accounts, no audit trail); the rebuild gives Super Admin real per-person authenticated accounts.
_Avoid_: Vendor Admin (mislabeled earlier in this doc — see Government Official for what `admin_users` actually is)

**Government Official**:
A read-only, Territory-scoped oversight account for a government education office (e.g. UPEO, DEO, DC, Education Secretary), used to monitor every School within their jurisdiction — dashboards and drill-down into attendance/exams/fees/etc., no write access. Corresponds to the legacy `admin_users` table (which is misleadingly named "Admin" in the legacy app — it is not vendor staff).
_Avoid_: Admin, Vendor Admin

**Subscription Code**:
A prepaid code, generated in a batch by the Super Admin (validity period + price) and issued to a School — directly today, and via self-service Distributor purchase in the rebuild — to activate or extend that School's subscription. Same concept as the legacy `activation_code`. A code's price may be 0 (free/promotional), but it is still a real code: redeeming it counts as "code history" like any paid code (see Trial). Redemption stacks the code's validity onto `max(today, current expiry)` — a still-active School's redemption extends its existing expiry, but a lapsed/expired School's redemption starts fresh from the redemption date rather than compounding onto a stale past-expiry date.
_Avoid_: Activation code (legacy term; keep using it only when referring to the legacy system)

**Trial**:
The status of a School that has had no revenue event yet — no paid invoice and no redeemed Subscription Code. Defined purely by that absence, not by time elapsed since signup: a trial School gets full feature access by default, though per-tenant feature flags can independently restrict this. Either a redeemed code (including a price-0 promotional one) or a paid monthly invoice ends Trial status permanently for that School. Trial sits in the same derived set as Active (within subscription expiry), Expired (expiry passed) and Suspended (the account switched off by Super Admin, which overrides all the others) — none of these is a stored column; all are computed from the School's money and account state.
_Avoid_: Free tier, demo mode (imply something time-boxed or feature-limited, which Trial is not by default)

**Fee Collection Record**:
The single record of a Student's fee status for one month, holding cumulative `pay_amount`/`fine_amount`/`adjust_amount`/`due_amount`. Exactly one exists per Student per month (preserve legacy exactly) — a second payment toward the same month **edits this same record's totals in place**, it does not append a new payment-history line. There is intentionally no per-payment-event audit trail underneath it; only the current cumulative totals are retained — so what a Student can be shown is a *statement*, never a transaction receipt. Corresponds to the legacy `student_fee_collection` table. Its `adjust_amount` (*ছাড়/বৃত্তি*) conflates two different things — a scholarship the child earned and a hardship waiver the family had to ask for — and nothing distinguishes them, which is why a Student sees the net figure and never the adjustment itself (ADR 0015).
_Avoid_: Payment, transaction (implies an individual event/line item, which this is not — it's a cumulative monthly total)

**Behaviour Log Entry**:
An incident note + numeric rating + remind date recorded against a Student. Becomes read-only 3 days after it was **created** (not 3 days after the incident date it describes, which is free-text and not a trustworthy anchor) — preserves the legacy rule against retroactively rewriting a Student's recorded history.
_Avoid_: Incident report (implies something more formal/investigative than this lightweight rating+note record)

**Considerable Grace Window**:
The number of grace minutes an Employee's attendance check-in/out is allowed to fall outside their configured office-time before being marked late/early. Configurable at multiple levels (global default, category, shift, per-individual override); when more than one applicable value exists for a given check (e.g. an Employee assigned to multiple shifts), the **effective grace is the max across all applicable configured values** for that check — never the stricter/smaller one.
_Avoid_: Buffer, tolerance (use "grace" consistently, matching legacy "considerable" terminology)

**Class Catalogue**:
The complete set of Classes defined for a School (the `classes` table) — one entry per class+section combination that exists, whether or not any Student is currently enrolled in it. The source of truth for "what Classes exist"; a Class appears here the moment it's created, before any Student is admitted into it.
_Avoid_: Class list, classes (ambiguous with the DB table name in prose)

**Period**:
An ordinal slot in a Class's weekly routine — first period, second period, up to twelve — **not a time of day**. Nothing in the product records when a period starts or ends; the school week is Sunday to Thursday, and a routine entry is (day, period, subject, teacher, room). This is why a Student's routine reads "Today / Tomorrow" rather than "next class": there is no clock to count down to. Distinct from **Office Time**, which is an Employee's attendance window and is the only concept here that carries real times.
_Avoid_: Class time, slot, lesson (each implies a scheduled clock time that does not exist)

**Exam Basic Info**:
The minimum configuration an Exam needs before it can be worked with: a Class and a Grading Scheme. An Exam missing either is not yet workable — marks cannot be entered against it and none of its documents can be produced. Not a workflow state or a stored flag: it is simply whether both values are set on the Exam. Co-curricular entry is the one exception, needing only the Class.
_Avoid_: Draft, incomplete, unconfigured (imply a stored status; there is none)

**Exam Closed state**:
A one-way, permanent state transition on an Exam — once Closed, marks/setup/routine/seat-plan/subjects become uneditable forever (verified against legacy: no reopen/undo path exists anywhere). Only aggregate result viewing remains available. Preserve as genuinely irreversible, not "irreversible in the UI but recoverable via support" — matches confirmed legacy behavior exactly. Closing is gated by ordinary Exam-screen Permission Grant access only, same as legacy — deliberately not a special elevated action, consistent with Permission Grant being screen-level-only with no per-action exceptions.
_Avoid_: Locked, archived (imply reversibility that doesn't exist here)

**Attendance Event**:
A single raw RFID/biometric card-tap record ingested via the dual-path pipeline (device push or bridge agent — see ADR 0001), staged before reconciliation. Multiple Attendance Events for the same person on the same day collapse to one finalized attendance record: the **earliest tap is entry, the latest tap is exit**; any taps in between are discarded as noise (e.g. a forgotten lunch tap-out/back-in). One finalized record per person per day, not one per in/out pair.
_Avoid_: Punch, tap (fine informally, but the record type is "Attendance Event")

**Absence SMS Rule**:
A School-configured trigger ("exactly N working-days absent" or "absent within an X–Y working-day range") that automatically sends an SMS about a Student. Uses the same "working days" definition as the absent-fine formula (§5.6: total days minus off-days, approved leave, and present days) — one definition, not redefined per feature. Evaluated by a once-daily scheduled job after that day's attendance is finalized, not triggered instantly on each attendance mark.
_Avoid_: Alert (implies real-time urgency this rule doesn't have)

**Permission Grant**:
A Staff User's access is boolean per screen/module (can open it or not) — not per-action (no separate read/write/delete). Matches the legacy `sub_user.paths` behavior (a list of navigation-tree paths the user may open). A Grant governs **the data behind the screen, not merely the screen**: it is enforced in Row Level Security, so it holds against the API as well as the navigation. Tables that several screens legitimately read — Students, Classes, Subjects — are not gated by any single Grant, because there is no per-action split available to separate "may look at a Student while marking a register" from "may edit a Student"; where a table is read by a few screens it names all of them. A Grant governs **which screens**, never **which Students**: that second question is answered by a Staff User's class attachment as **Class Teacher** or **Subject Teacher**, and the two axes are independent (ADR 0017). Office staff have no attachment, so Grants are their only reach — and no Grant lets them act on a Student directly.
_Avoid_: Role, permission level (implies granularity beyond screen-level access)

**Student**:
A person enrolled at a School, and — since map #434 — an **actor** with their own login, not merely a record. A Student signs in at `/student/*` to read their own school life: classes, notices, tasks, study materials, results, attendance, fees, exam schedule and leave calendar. A Student **never edits a school record**: `students` and every other school-owned row is read-only to them. The complete set of things a Student may create is requests and their own work — a correction request, a leave request, a question to their Class Teacher, a task marked done, and a homework upload. When their School's subscription is **Expired**, a Student keeps every one of their reads and loses every one of those writes — expiry is a renewal prompt aimed at the person who can pay, and a child cannot pay, but a fully live portal would remove the pressure entirely. A **Suspended** School is different: that is a deliberate Super Admin switch, and it blocks its Students outright. This reverses the earlier v1 position that a Student is "a data subject, not an actor"; that decision, and the "parent portal is out of scope" line in map #24, are superseded for the Student only.
_Avoid_: Student user (say Student), pupil

**Parent / Guardian** (data subject, not an actor):
A Student's guardian has no login. They are reached through their child's record — SMS, and the public notice/gallery pages. A separate guardian identity holding several children across classes is a different product and has not been started.
_Avoid_: Parent account (implies a login that does not exist)

**Student Number**:
The immutable, per-School identifier a Student's login is derived from (`students.student_no`, unique per School). Auto-assigned at admission as `S0001`, `S0002`, … but overridable on the admission form, so a school can keep the admission numbers it already uses on paper. Distinct from **Roll Number**, which is unique only within a class and is rewritten at promotion — a Roll Number cannot identify a login, a Student Number can. The derived address is `<student_no>@<login domain>.students.invalid`, deliberately non-routable: it is a username, not a mailbox, and no mail can ever reach or be silently discarded at it. The login domain is the School's subdomain where one is set, and a stable slug off the School's id otherwise — only a fifth of Schools have a subdomain, so requiring one would have left most of them unable to issue any login. It is resolved once and then stored (`schools.student_login_domain`), so a School's addresses stay consistent with each other even if a subdomain is set later. Because the address is *derived* rather than allocated, a login that is abandoned without being revoked holds its address forever and blocks the Student Number that produced it from ever being issued a login again — so revoking a login genuinely releases it, rather than merely detaching it.
_Avoid_: Admission number, registration number, roll (each is a different identifier)

**Class Teacher**:
The one Employee responsible for a Class (`classes.class_teacher_id` → `employees.id`) — the Student's named point of contact and the recipient of their questions. Signs in with an ordinary Staff User login, not a role of their own; the link between the HR record and the login is `employees.profile_id`. Required on every Class as a matter of product rule (enforced by the Class form), not by a database constraint — staging and main share one database, so the column stays nullable. A Class Teacher without a login is still assignable: their students' questions are answered by the School Owner, who can read every question in the School. Being assigned to a Class carries **full authority over that Class's Students** — their leave, their questions, their notices, their study materials — and that authority needs **no Permission Grant**: the assignment is the Owner's statement of intent, and requiring a second switch only creates a silent, student-facing way to forget (ADR 0017). The School Owner remains able to decide everything regardless. A Class Teacher's reach stops at her own Class: she cannot address the whole School.
_Avoid_: Form teacher, homeroom teacher, class in-charge

**Subject Teacher**:
An Employee who appears in a Class's routine (`routine_slots.teacher_id`) without being its Class Teacher. They may **teach** the Class — upload study materials, post notices to it — and **decide nothing** about the children in it: no leave approval, no answering questions, no profile corrections. One person is routinely both: Class Teacher of 6-A and Subject Teacher of 9-B, with full authority in the first and teaching rights only in the second. The two capacities are evaluated per Class, never per person.
_Avoid_: Teacher (ambiguous — say Class Teacher or Subject Teacher), assigned teacher
