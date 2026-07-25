import type { MessageKey } from '@/lib/i18n'
import type { LifecycleStatus } from '@/lib/super-admin/dashboard'

// Shared badge styling + i18n key for a school's lifecycle status, so the
// schools list and the school-detail page render the same badge from one source
// (they had diverged — the list lacked `blocked`).
export const LIFECYCLE_STATUS_STYLE: Record<LifecycleStatus, string> = {
  trial: 'bg-sky-soft text-sky-deep',
  active: 'bg-mint-soft text-mint-deep',
  expired: 'bg-alert-soft text-alert-deep',
  blocked: 'bg-alert-soft text-alert-deep',
}

export const LIFECYCLE_STATUS_KEY: Record<LifecycleStatus, MessageKey> = {
  trial: 'sa.kpi.trial',
  active: 'sa.kpi.active',
  expired: 'sa.kpi.expired',
  blocked: 'sa.kpi.blocked',
}
