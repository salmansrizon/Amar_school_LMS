# ADR 0011 — Commission is calculated on gross; a Discount Agreement's cost is split explicitly

Status: Accepted (map #458, docs/012_super_admin_ui.md §21)

## Context

Distributors and the platform jointly discount a School's monthly bill to win or
keep the sale ("six months at 30%, split 50/50"). Doc 012 §21 calls for a
discount-sharing ratio between Distributor and platform, and requires the split
to be visible to every party on the invoice/statement.

Two ways to make a Distributor "share" a discount:

- Calculate commission on the **net** (discounted) amount. The Distributor then
  absorbs exactly its commission rate's worth of the discount — so the agreed
  ratio is decorative: set 50/50 or 30/70 and the arithmetic ignores you.
- Calculate commission on the **gross** (list) amount and then deduct the
  Distributor's agreed share of the discount as its own explicit figure.

## Decision

**Commission base is always the invoice's gross (list) amount.** Where a
Discount Agreement applies, the Distributor's share of the discount is deducted
from that commission to give the Distributor's net payable. Both figures appear
on the invoice and on both partners' statements.

Worked example — gross 3,000; discount 30% (900); distributor share 50%;
commission rate 70%:

| | ৳ |
|---|---|
| Gross (list) | 3,000 |
| Discount 30% | −900 |
| **School pays** | **2,100** |
| Commission 70% of gross | 2,100 |
| Distributor's 50% share of discount | −450 |
| **Distributor payable** | **1,650** |
| **Platform net** (30% of gross 900 − its 450 share) | **450** |

**The governing identity, true of every invoice:**

```
collected = distributor payable + platform net
discount  = distributor share    + platform share
```

Every screen, statement, settlement and report in the panel must satisfy it; any
number that does not is a bug, not a rounding difference. The resolved gross,
discount, share and rate are **snapshotted** onto the invoice and the
`commissions` row at issue time, so a reprint years later reproduces the same
arithmetic even after config changes.

**Platform net may go negative** (a high commission rate plus a large
platform-side share). This is allowed — a loss-leader deal is a legitimate
commercial act — but the approval screen must **warn**, and approving anyway
records an override reason in the audit log.

## Consequences

- The sharing ratio is a real, auditable number both partners can see, not an
  artefact of the commission rate.
- Changing a commission rate or a discount later cannot rewrite past invoices.
- Every financial surface must read gross, discount, share and commission from
  the snapshot, never recompute from current config.
