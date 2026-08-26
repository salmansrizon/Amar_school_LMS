# A Student never sees their own fee adjustment

`fee_collection_records.adjust_amount` is labelled *ছাড়/বৃত্তি* and carries two different things in one column: a scholarship the child earned, and a hardship waiver the family had to ask for. Nothing in the data distinguishes them, so the Student Portal (map #434, ticket #453) has to assume the second reading — and shows a Student only **payable, paid, fine and due**, with the net already reduced by the adjustment and the adjustment itself absent.

## Consequences

This only holds if a Student cannot reconcile their bill against the list price. **`fee_structures` must stay staff-only**: a Student who can see "Class 9 monthly fee ৳3,000" next to their own ৳1,000 bill has been told about the waiver by subtraction. Any later ticket that opens fee structures to the student side reopens this decision.

A "receipt" for a Student is necessarily a **statement**, not a transaction receipt — `fee_collection_records` keeps one cumulative row per Student per month with no per-payment history by design (see **Fee Collection Record** in `CONTEXT.md`), so there is no payment event to issue a receipt for.

## Considered and rejected

- **Full parity with the staff view** — ships the hardship waiver to the child.
- **A per-school toggle** — pushes the judgement onto a settings checkbox nobody reads, and the default would decide it for almost every school anyway.
