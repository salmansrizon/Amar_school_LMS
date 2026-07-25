import type { MessageKey } from '@/lib/i18n'

// The per-school feature flags the super-admin can toggle (ticket #168). Storage
// + UI only — nothing enforces these yet (deferred). One source for the toggle
// list + labels; add a key here and it appears on every school-detail page.
export const FEATURE_FLAGS = ['exams', 'accounting', 'sms', 'publishing', 'library', 'sms_metering'] as const
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]

export const FEATURE_FLAG_KEY: Record<FeatureFlagKey, MessageKey> = {
  exams: 'sa.flags.exams',
  accounting: 'sa.flags.accounting',
  sms: 'sa.flags.sms',
  publishing: 'sa.flags.publishing',
  library: 'sa.flags.library',
  // Prepaid SMS enforcement (map #171 T6): when on, sends are denied once the
  // school's credit balance can't cover them. Off = send freely (still metered).
  sms_metering: 'sa.flags.smsMetering',
}

/** Whether every listed flag string is a known key (guards the toggle action). */
export function isFeatureFlag(key: string): key is FeatureFlagKey {
  return (FEATURE_FLAGS as readonly string[]).includes(key)
}
