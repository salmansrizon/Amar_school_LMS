# ADR 0023 - Provider-neutral payment lifecycle

Status: Accepted

## Context

The LMS currently records manual payments and posts confirmed payments through
the central financial flow. Gateway work must not create a second accounting
path or tie the domain model to one Bangladesh provider.

## Decision

Use a provider-neutral payment intent and provider-event boundary. An intent
belongs to one issued invoice, stores the server-derived BDT amount, uses an
idempotency key, and moves through `created`, `pending`, `succeeded`, `failed`,
or `expired`. Provider notifications are append-only and deduplicated by
provider plus provider event ID; stored payloads are redacted.

Provider adapters implement one internal TypeScript contract and are selected
through a registry. No real provider is enabled by this decision. A successful
intent must enter the existing `payment_confirm` flow so GL posting remains
centralized and idempotent.

## Consequences

Future providers need an adapter, not schema or accounting changes. Callback
verification, provider-side validation, invoice/amount matching, and transition
authorization remain required in the adapter/command layer before live launch.
