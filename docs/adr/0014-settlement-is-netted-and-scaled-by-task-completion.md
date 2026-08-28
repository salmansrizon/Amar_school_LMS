# ADR 0014 — A settlement is one netted statement, scaled by agent task completion

Status: Accepted (map #458, docs/012_super_admin_ui.md §12/§17)

## Context

Money flows both ways between the platform and a Distributor. The platform owes
commission (ADR 0011); the Distributor owes for SMS credit packs, Subscription
Code batches and Agent certification fees. Separately, the Distributor's
operational obligation is that its Agents actually complete the assigned field
work — the platform's quality of service to Schools depends on it, and the
vendor wanted that obligation to have teeth rather than be a dashboard number.

## Decision

**1. One netted settlement per Distributor per period.** The statement shows the
build-up, never just the net: gross commission per source invoice, each Discount
Agreement share deducted, each of the Distributor's own unpaid invoices offset
by number, task-completion adjustment, then the net payable. One payment per
period.

**2. Commission is scaled by task completion.** For the settlement period,
`completion = completed ÷ assigned`, counting only tasks whose **deadline falls
inside the period**. Commission payable is multiplied by that rate, and the
withheld amount is printed as its own line ("Task completion 80% — withheld
৳420"). **Zero tasks assigned counts as 100%**, never 0%.

**3. Late completion recovers the withheld amount.** Completing a task after its
period closes adds a "recovered from <period>" line to the *next* settlement,
naming the task. The closed settlement is never edited (ADR 0012); recovery is
recognised in the period it is earned. The incentive is to get the work done,
not to collect penalties.

**4. A negative net carries forward.** If the Distributor owes more than the
platform owes, the settlement pays nothing and the balance carries to the next
period, visible on both sides' statements. It is never silently written off.

**5. Certification fees are ordinary invoices** to the Distributor, raised on
approval of the certification, and therefore netted by rule 1 like any other
Distributor invoice.

## Consequences

- Task data becomes financial data: `partner_tasks` deadlines and completion
  timestamps feed a settlement figure, so they require the same audit trail as
  money — who marked it done, and when.
- Reminders before period close are part of the mechanism, not a nicety: a
  deduction the Distributor never saw coming is a dispute.
- Assigned-vs-completed is the headline KPI on both the Agent and Distributor
  profiles, and it must agree exactly with the number the settlement used.
