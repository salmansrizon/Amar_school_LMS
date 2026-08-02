// Audit Engine — SEAM ONLY (map #258, implemented in #261).
// Immutable append-only audit_log. Auto-capture via event subscription +
// explicit audit() fallback for non-event mutations. v1 scope: financial,
// permissions, subscriptions, workflow, config. Retained forever.

export type AuditAction = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'configure'

export interface AuditEntry {
  actorId: string | null
  schoolId: string | null
  entityType: string
  entityId: string
  action: AuditAction
  before: unknown | null
  after: unknown | null
  ip: string | null
  requestId: string | null
}

export interface AuditEngine {
  /** Explicitly record an audit entry (non-event mutations). */
  record(entry: AuditEntry): Promise<void>
}
