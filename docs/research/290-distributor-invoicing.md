# #290 — Manual invoices + distributor billing + print (research)

Map #284. Decides the **party model + print/confirm** so a super-admin can bill a
**distributor** (e.g. an SMS-credit purchase), the distributor sees / confirms /
prints it, and school invoicing keeps working unchanged. No schema change in this
ticket — this proposes the shape; a build ticket implements it.

## Current model (0086_invoicing_payments)

- `invoices`: `school_id uuid NOT NULL → schools`, `number` (seq `INV-YYYY-#####`),
  `status draft|issued|paid|void`, `income_account → gl_accounts`, subtotal/tax/total,
  `due_at`, `memo`. `invoice_lines` (qty × unit). `payments` (amount, method, status
  pending|confirmed|void).
- RPCs (all `security definer`, super/system): `invoice_create(p_school_id, p_lines,
  p_tax, p_income_account, p_due_at, p_memo)` → inserts invoice+lines, posts GL
  (debit AR `1100` / credit income + tax `2000`), emits `InvoiceGenerated`, audits.
  `payment_record` (pending) → `payment_confirm` (guards `issued`, sets `paid`, posts
  cash GL).
- RLS: super-admin reads all; **school** reads own (`school_id = app_current_school_id()`).
- **Blocker:** `school_id` is required + school-only. A distributor is a `profiles`
  row, not a school, so there is no way to address an invoice to one today.

## Options

**A. Polymorphic party** — `school_id` nullable + `party_type ('school'|'distributor')`
+ `party_id`. Most general, but every consumer (RLS, invoice_create, GL scoping,
reporting, the existing school reads) must branch on `party_type`. Highest churn.

**B. Nullable school_id + optional distributor_id (recommended)** — make `school_id`
nullable, add `distributor_id uuid null → profiles`, `CHECK (num_nonnulls(school_id,
distributor_id) = 1)`. School invoices are unchanged (school_id set, distributor_id
null); distributor invoices flip it. `gl_entries.school_id` is already nullable, so a
distributor invoice posts GL with `school_id = null` (platform-scoped) — no GL schema
change. Smallest, additive migration; preserves all existing school paths.

**C. Separate `distributor_invoices` table** — rejected: duplicates lines/payments/GL
logic and a second numbering sequence.

## Recommendation — Option B

### Schema (build-ticket migration, additive)
- `alter table invoices alter column school_id drop not null;`
- `add column distributor_id uuid references profiles(id);`
- `add constraint invoice_one_party check (num_nonnulls(school_id, distributor_id) = 1);`
- RLS: add `"distributor reads own invoices" … using (distributor_id = auth.uid())`
  and the matching `invoice_lines` / `payments` visibility (extend `invoice_visible`).

### RPC
- `invoice_create` gains `p_distributor_id uuid default null`; require exactly one of
  school/distributor; GL posts with `school_id => null` when it's a distributor
  invoice (income account still applies, e.g. SMS income `4100`). Everything else
  (numbering, lines, AR, event, audit) is unchanged.
- Reuse `payment_record` / `payment_confirm` as-is (they key off the invoice).

### Confirm flow
- Super-admin **creates** the invoice for a distributor + **confirms** payment
  (existing `payment_confirm`, super/system only) — matches how school payments work.
- Distributor **sees** it (RLS read) and **records** a payment (pending) via
  `payment_record` acting on their own invoice; super-admin confirms. (A distributor
  self-confirm is out of scope — keep confirmation vendor-side for money safety.)

### Print
- A printable invoice route (e.g. `/distributor/invoices/[id]` with a Print button →
  `window.print()`). The shared `AppShell` is already print-neutralised (chrome
  `print:hidden`, `contentContainer` pages own their `<main>`), so a plain invoice
  layout prints clean with no extra work. Optional: a dedicated `print:` stylesheet
  for a formal layout.

## Graduated build ticket scope
1. Migration B (nullable school_id + distributor_id + one-party check + distributor RLS).
2. `invoice_create` party param + GL null-school branch.
3. Super-admin: "Bill a distributor" form (distributor, lines, income account) on the
   invoices page.
4. Distributor: `/distributor/invoices` list + detail + **print**; record-payment action.
5. Verify school invoicing unchanged (characterization).
