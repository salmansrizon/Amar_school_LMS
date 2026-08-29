---
status: accepted
amends: the "gapless sequence per financial year" clause of ADR-0012
---

# Gapless numbering serialises its issuers, so it is a counter and never a sequence

ADR 0012 requires a "gapless sequence per financial year" for invoice and receipt numbers, and says in as many words that "a gap is an audit finding". The implementation used a Postgres `SEQUENCE`. The two contradicted each other from the day both were written, and nobody noticed for 1,276 invoices and roughly 24,000 burned numbers.

`nextval` is non-transactional **by design**. That is what lets concurrent writers take numbers without blocking each other, and it is also why a number taken by a transaction that later rolls back is gone permanently. It is not a bug in Postgres and no configuration fixes it. A sequence can never satisfy ADR 0012.

## Decision

**A document number that must be gapless is allocated from a row in an ordinary table, incremented under a row lock inside the issuing transaction.** `invoice_number_counters` (one row per financial year) and `invoice_number_next(year)` are that mechanism. Abandon the transaction and the number comes back.

The cost is explicit and accepted: concurrent issuers serialise on that row. **Gapless and lock-free are mutually exclusive** — there is no third option, and any future proposal that claims both is wrong somewhere. Invoicing is measured in documents per day, so the lock is free here. If some future document type is issued at a rate where the lock hurts, the correct move is to decide that *that* document does not need to be gapless — not to reach for a sequence and quietly reintroduce this defect.

## What actually burned the numbers

Worth recording, because the shape recurs. `subscription_billing_sweep` looped over every school inside one function — therefore one transaction — taking a number per school. Any school raising part way through rolled back every invoice in the run **and** the `subscription_billing_runs` dedup rows, while every number the run consumed stayed consumed. So the next run billed the same schools again and burned another full set.

Two properties were needed, not one:

1. The allocation rolls back with its transaction (the counter).
2. One school's failure is one school's failure (a per-school exception block, so the rollback reaches a savepoint rather than the whole run).

A counter alone would have kept the numbering gapless while still discarding fifty-one good invoices because the fifty-second school was broken.

## The counter is readable by the Super Admin

RLS on with no policies makes the numbering state invisible to everyone outside a `SECURITY DEFINER` function. For this table that is backwards: ADR 0012 wants an auditor to trace a printed register back to its source, and a counter no auditor can inspect works against that. Super Admin reads it, and writes it — correcting a counter after a restore is a real operation, and the alternative is doing it as the database owner with no audit trail at all.

## The historical gap stays

The counter was seeded from the sequence's last value, not from `max(invoices.number)`, so no newly issued number can collide with an already printed one. Everything below that point stays discontinuous. Renumbering would mean inventing documents, and ADR 0012 exists to say documents are not invented. The gap is a recorded finding with a cause, which is what an auditor can work with.

## Consequences

- Numbers are still allocated **at issue, never at draft** — a draft has no number (ADR 0012). The counter changes where the number comes from and nothing else.
- Any long-running batch that issues documents must isolate per-item failures, or it converts one bad row into a run-wide rollback.
- Receipt numbering carries the same requirement from ADR 0012 and must use the same mechanism when it is built. Do not add a sequence for it.
- `invoice_number_seq` remains only as the seed source for the counter. Nothing allocates from it.

## Considered and rejected

- **Keep the sequence, log the gaps.** Turns a hard requirement into a report someone reconciles by hand. ADR 0012 already ruled that a gap is a finding, not an annotation.
- **Allocate the number after commit, in a second transaction.** The document briefly exists without a number, and a crash between the two leaves it that way. Trades gaps for nulls.
- **`setval` back down after a rollback.** Racy with any concurrent issuer, and needs to know a rollback happened — which the aborted transaction cannot tell it.
- **Drop the gapless requirement.** Legitimate for internal identifiers, not for a document a Bangladeshi audit firm reads. That decision belongs to ADR 0012 and is not being reopened here.
