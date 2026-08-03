// Workflow Engine — SEAM ONLY (map #258, implemented in #264).
// Generic configurable approvals. v1 shapes: single-level + multi-level
// sequential. Definitions stored in DB (Super-Admin configurable). Approver by
// role or specific user. Publishes workflow domain events (Event engine).

export type WorkflowStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled'

export interface WorkflowStartInput {
  /** Definition key, e.g. 'leave_approval', 'distributor_onboarding'. */
  definitionKey: string
  schoolId: string | null
  initiatorId: string
  /** Subject entity the workflow governs. */
  entityType: string
  entityId: string
  payload?: unknown
}

export interface WorkflowActions {
  approve(instanceId: string, approverId: string, comment?: string): Promise<void>
  reject(instanceId: string, approverId: string, comment?: string): Promise<void>
}

export interface WorkflowEngine {
  start(input: WorkflowStartInput): Promise<{ instanceId: string; status: WorkflowStatus }>
  actions: WorkflowActions
  status(instanceId: string): Promise<WorkflowStatus>
}
