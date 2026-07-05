---
status: accepted
---

# Shared database, shared schema, tenant_id-scoped multi-tenancy

The legacy system already runs every School's data through one shared MySQL database and schema, distinguished by a company/school ID column on each table — there's no per-school database or connection today. We're keeping that shape in the Postgres rebuild: one database, one schema, every School-scoped table carries a `school_id` column, enforced by Postgres Row-Level Security policies in addition to application-layer checks. We considered schema-per-tenant and database-per-tenant for stronger isolation, but rejected both: they multiply migration/operational complexity (per-schema or per-database migrations) for a system that has run safely on the shared-table model for its entire life, and they conflict with the free-tier/prototype-first hosting approach (a single small Postgres instance, not N databases).
