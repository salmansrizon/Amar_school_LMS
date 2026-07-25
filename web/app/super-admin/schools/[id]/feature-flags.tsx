'use client'

import { useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { FEATURE_FLAGS, FEATURE_FLAG_KEY } from '@/lib/super-admin/feature-flags'
import { setFeatureFlag } from '../actions'

// Per-school feature-flag toggles (issue #168). Storage + UI only — toggling
// persists the boolean; nothing enforces it yet.
export function FeatureFlagToggles({
  schoolId,
  enabled,
  lang,
}: {
  schoolId: string
  /** Currently-enabled flag keys for this school. */
  enabled: string[]
  lang: Lang
}) {
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURE_FLAGS.map((f) => [f, enabled.includes(f)])),
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <h2 className="mb-1 font-bold">{t('sa.flags.title', lang)}</h2>
      <p className="mb-3 text-xs text-muted">{t('sa.flags.hint', lang)}</p>
      <ul className="flex flex-col gap-2">
        {FEATURE_FLAGS.map((flag) => (
          <li key={flag} className="flex items-center justify-between">
            <span className="text-sm font-medium">{t(FEATURE_FLAG_KEY[flag], lang)}</span>
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={state[flag]}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked
                  setState((s) => ({ ...s, [flag]: next }))
                  startTransition(async () => {
                    setError(null)
                    const result = await setFeatureFlag(schoolId, flag, next)
                    if (result.error) {
                      setError(result.error)
                      setState((s) => ({ ...s, [flag]: !next })) // revert on failure
                    }
                  })
                }}
              />
              <span className="relative h-5 w-9 rounded-full bg-line-strong transition peer-checked:bg-brand-500 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-alert-deep">{error}</p>}
    </section>
  )
}
