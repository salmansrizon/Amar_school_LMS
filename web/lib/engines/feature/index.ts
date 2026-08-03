// Feature Engine — SEAM ONLY (map #258, implemented in #263).
// Configurable module/sub-module/feature availability per school & plan.
// Extends school_feature_flags (0073) into a catalog + plan bindings.
// Enforcement flows through the Policy pipeline + nav/menu + API gating.

export type FeatureState = 'active' | 'disabled' | 'trial' | 'premium'

export interface FeatureAvailability {
  featureKey: string
  state: FeatureState
  effectiveFrom: string | null
  expiresAt: string | null
}

export interface FeatureEngine {
  /** Whether a feature is currently usable for a school. */
  isEnabled(schoolId: string, featureKey: string): Promise<boolean>
  /** All feature availabilities resolved for a school (plan + overrides). */
  resolve(schoolId: string): Promise<FeatureAvailability[]>
}
