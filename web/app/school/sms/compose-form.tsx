'use client'

import { useMemo, useState, useTransition } from 'react'
import { labelClass } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { t, type Lang } from '@/lib/i18n'
import { countSmsSegments } from '@/lib/sms/segments'
import { resolveRecipients, type ComposeMode, type ComposeStudentRow, type ComposeEmployeeRow } from '@/lib/sms/recipients'
import { sendCompose } from './actions'

// Themed to match the dashboard: rounded-2xl cards, brand-600 primary, rounded-lg
// form controls with a visible focus ring.
const cardClass = 'rounded-2xl border border-line/70 bg-paper/92 p-5 shadow-card backdrop-blur'
const selectClass =
  'h-10 w-full rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300'
const inputClass = selectClass
// Equal minimum width so the two actions stay the same size when labels swap bn/en.
const actionBtn = 'min-w-[9rem]'

const DRAFT_KEY = 'asm-sms-compose-draft'

interface Draft {
  mode: ComposeMode
  className: string
  section: string
  category: string
  manualNumbers: string
  body: string
}

const EMPTY_DRAFT: Draft = {
  mode: 'class_section',
  className: '',
  section: '',
  category: '',
  manualNumbers: '',
  body: '',
}

export function ComposeForm({
  lang,
  students,
  employees,
  classNames,
  sections,
  categories,
}: {
  lang: Lang
  students: ComposeStudentRow[]
  employees: ComposeEmployeeRow[]
  classNames: string[]
  sections: string[]
  categories: string[]
}) {
  // Restore a locally-saved draft as the initial state (client-only; no
  // server draft storage exists for this screen — see "Save Draft" below).
  // A lazy initializer rather than an effect avoids an extra render pass.
  const [draft, setDraft] = useState<Draft>(() => {
    if (typeof window === 'undefined') return EMPTY_DRAFT
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (raw) return { ...EMPTY_DRAFT, ...JSON.parse(raw) }
    } catch {
      // ignore malformed/unavailable storage
    }
    return EMPTY_DRAFT
  })
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)
  const [draftSaved, setDraftSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const recipients = useMemo(
    () =>
      resolveRecipients(draft.mode, {
        students,
        employees,
        filter: { className: draft.className, section: draft.section },
        category: draft.category,
        manualNumbers: draft.manualNumbers,
      }),
    [draft, students, employees],
  )

  const segmentInfo = useMemo(() => countSmsSegments(draft.body), [draft.body])

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setDraftSaved(false)
    setResult(null)
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      setDraftSaved(true)
    } catch {
      // ignore unavailable storage
    }
  }

  function submit() {
    setError(null)
    setResult(null)
    const formData = new FormData()
    formData.set('mode', draft.mode)
    formData.set('class_name', draft.className)
    formData.set('section', draft.section)
    formData.set('category', draft.category)
    formData.set('manual_numbers', draft.manualNumbers)
    formData.set('body', draft.body)
    startTransition(async () => {
      const res = await sendCompose(formData)
      if (res.error) setError(res.error)
      else {
        setResult({ sent: res.sent ?? 0, failed: res.failed ?? 0 })
        try {
          window.localStorage.removeItem(DRAFT_KEY)
        } catch {
          // ignore
        }
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="mb-3 text-lg font-bold">{t('sms.recipientGroup', lang)}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t('sms.buildBy', lang)}</label>
            <select
              className={selectClass}
              value={draft.mode}
              onChange={(e) => update('mode', e.target.value as ComposeMode)}
            >
              <option value="class_section">{t('sms.modeClassSection', lang)}</option>
              <option value="group">{t('sms.modeGroup', lang)}</option>
              <option value="manual">{t('sms.modeManual', lang)}</option>
            </select>
          </div>

          {draft.mode === 'class_section' && (
            <>
              <div>
                <label className={labelClass}>{t('sms.class', lang)}</label>
                <select className={selectClass} value={draft.className} onChange={(e) => update('className', e.target.value)}>
                  <option value="">{t('sms.allClasses', lang)}</option>
                  {classNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('sms.section', lang)}</label>
                <select className={selectClass} value={draft.section} onChange={(e) => update('section', e.target.value)}>
                  <option value="">{t('sms.allSections', lang)}</option>
                  {sections.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {draft.mode === 'group' && (
            <div>
              <label className={labelClass}>{t('sms.category', lang)}</label>
              <select className={selectClass} value={draft.category} onChange={(e) => update('category', e.target.value)}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {draft.mode === 'manual' && (
            <div className="sm:col-span-2">
              <label className={labelClass}>{t('sms.manualNumbersLabel', lang)}</label>
              <input
                type="text"
                className={inputClass}
                placeholder="01711xxxxxx, 01911xxxxxx"
                value={draft.manualNumbers}
                onChange={(e) => update('manualNumbers', e.target.value)}
              />
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          {t('sms.estimatedRecipients', lang)}: {recipients.length}
          {lang === 'bn' ? ' জন' : ''}
        </p>
      </div>

      <div className={cardClass}>
        <h2 className="mb-3 text-lg font-bold">{t('sms.messageCard', lang)}</h2>
        <textarea
          rows={5}
          className="w-full rounded-lg border border-line-strong bg-paper p-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300"
          value={draft.body}
          onChange={(e) => update('body', e.target.value)}
        />
        <p className="mt-2 text-xs text-muted">
          {segmentInfo.length}/{segmentInfo.encoding === 'gsm7' ? 160 : 70} {t('sms.characters', lang)} ·{' '}
          {segmentInfo.segments} {t('sms.segments', lang)}
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {result && (
          <p className="mt-2 text-sm text-mint-deep">
            {t('sms.sendComplete', lang)}: {t('sms.totalSent', lang)} {result.sent}
            {result.failed > 0 ? ` · ${t('sms.failed', lang)} ${result.failed}` : ''}
          </p>
        )}
        {draftSaved && <p className="mt-2 text-sm text-muted">{t('sms.draftSaved', lang)}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            className={actionBtn}
            disabled={pending || recipients.length === 0 || !draft.body.trim()}
            onClick={submit}
          >
            {t('sms.sendNow', lang)}
          </Button>
          <Button variant="secondary" className={actionBtn} onClick={saveDraft}>
            {t('sms.saveDraft', lang)}
          </Button>
        </div>
      </div>
    </div>
  )
}
