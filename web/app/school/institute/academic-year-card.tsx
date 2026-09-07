'use client'

import { useState } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { startAcademicYear } from './actions'

// Start Academic Year (issue #570, #594) — a distinct card with its own
// explicit action + confirmation, deliberately separate from the Profile
// tab's single save-everything form (grilled #594, Q9): this is a
// forward-only, audited, no-undo transition, not an ordinary settings edit.
export function AcademicYearCard({
  lang,
  isOwner,
  currentYear,
}: {
  lang: Lang
  isOwner: boolean
  currentYear: number | null
}) {
  // Pre-filled to current+1 (grilled #594, Q12) — the common case is a
  // single-year advance; the input stays editable upward for a School
  // catching up on more than one year at once.
  const [year, setYear] = useState(currentYear !== null ? currentYear + 1 : 2000)

  return (
    <section className="mt-6 rounded-lg border border-line bg-paper p-4">
      <h2 className="mb-2 text-lg font-bold">{t('institute.academicYearTitle', lang)}</h2>
      <p className="mb-3 text-sm text-muted">
        {t('institute.academicYearCurrentLabel', lang)}:{' '}
        <span className="font-semibold text-ink">{currentYear ?? '—'}</span>
      </p>
      {isOwner && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass} htmlFor="new_academic_year">
              {t('institute.academicYearNewLabel', lang)}
            </label>
            <input
              id="new_academic_year"
              type="number"
              min={currentYear !== null ? currentYear + 1 : 2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <ConfirmDialog
            triggerLabel={t('institute.academicYearStart', lang)}
            triggerClassName={primaryBtnClass}
            title={t('institute.academicYearConfirmTitle', lang)}
            body={`${t('institute.academicYearConfirmBody', lang)} ${currentYear ?? '—'} → ${year}. ${t(
              'institute.academicYearCannotUndo',
              lang,
            )}`}
            confirmLabel={t('institute.academicYearStart', lang)}
            cancelLabel={t('routine.cancel', lang)}
            onConfirm={async () => {
              const result = await startAcademicYear(year)
              if (result.error) return { error: result.error }
            }}
          />
        </div>
      )}
    </section>
  )
}
