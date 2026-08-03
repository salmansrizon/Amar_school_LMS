// Feature engine implementation (map #258, #263). Resolution lives in the
// app_feature_enabled definer RPC (school override -> plan -> default_state, with
// dependency AND); this is the thin client over it, plus a pure nav filter.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeatureAvailability, FeatureEngine, FeatureState } from './index'

/** Whether a feature is currently usable for a school. */
export async function isFeatureEnabled(
  client: SupabaseClient,
  schoolId: string,
  featureKey: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('app_feature_enabled', {
    p_school: schoolId,
    p_feature: featureKey,
  })
  if (error) return false
  return data === true
}

export function createFeatureEngine(client: SupabaseClient): FeatureEngine {
  return {
    isEnabled: (schoolId, featureKey) => isFeatureEnabled(client, schoolId, featureKey),
    resolve: async (schoolId) => {
      const { data } = await client
        .from('school_features')
        .select('feature_key, state, effective_from, expires_at')
        .eq('school_id', schoolId)
      return ((data ?? []) as {
        feature_key: string
        state: FeatureState
        effective_from: string | null
        expires_at: string | null
      }[]).map(
        (r): FeatureAvailability => ({
          featureKey: r.feature_key,
          state: r.state,
          effectiveFrom: r.effective_from,
          expiresAt: r.expires_at,
        }),
      )
    },
  }
}

/** Pure nav gate: keep an item unless its feature is explicitly disabled. The
 * "show unless disabled" default preserves today's behavior (nav was ungated),
 * so wiring this in front of school-nav changes nothing until a feature is
 * turned off. Items without a `key` in the map are always kept. */
export function filterEnabledNav<T extends { key: string }>(
  items: readonly T[],
  enabled: Record<string, boolean>,
): T[] {
  return items.filter((item) => enabled[item.key] !== false)
}
