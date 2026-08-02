// Feature catalog (map #258, #263) — the module/feature keys seeded in
// 0081_feature_engine.sql (one feature per current School screen). Code
// references these constants, not string literals.
export const FEATURE_KEYS = [
  'students',
  'employees',
  'attendance',
  'classes',
  'exams',
  'fees',
  'sms',
  'notices',
  'feedback',
  'institute',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]
