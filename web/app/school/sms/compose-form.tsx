'use client'

import { useMemo, useState, useTransition } from 'react'
import { labelClass } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { t, type Lang } from '@/lib/i18n'
import { countSmsSegments } from '@/lib/sms/segments'
import {
  classTargetFromInput,
  resolveRecipients,
  type ComposeMode,
  type ComposeStudentRow,
  type ComposeEmployeeRow,
} from '@/lib/sms/recipients'
import { classCatalogueOptions, type ClassCatalogueRow } from '@/lib/class-catalogue'
import type { TargetScope } from '@/lib/publishing'
import { sendCompose } from './actions'
import { ComboboxField } from '@/components/ui/combobox-field'
import { SelectField } from '@/components/ui/select-field'

// Themed to match the dashboard: rounded-2xl cards, brand-600 primary, rounded-lg
// form controls with a visible focus ring.
const cardClass = 'rounded-2xl border border-line/70 bg-paper/92 p-5 shadow-card backdrop-blur'
const inputClass =
  'h-10 w-full rounded-lg border border-line-strong bg-paper px-3 text-sm outline-none transition focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-300'
// Equal minimum width so the two actions stay the same size when labels swap bn/en.
const actionBtn = 'min-w-[9rem]'

// Bumped from -draft when the Class/Section text fields were replaced by the
// Offering-aware target picker (map #598 Wave 5, #606) — an old draft's
// className/section values must not leak into the new broadcast fields.
const DRAFT_KEY = 'asm-sms-compose-draft-v2'

interface Draft {
  mode: ComposeMode
  targetScope: TargetScope
  offeringId: string
  className: string
  shift: string
  groupDepartment: string
  section: string
  category: string
  manualNumbers: string
  body: string
}

const EMPTY_DRAFT: Draft = {
  mode: 'class_section',
  targetScope: 'all',
  offeringId: '',
  className: '',
  shift: '',
  groupDepartment: '',
  section: '',
  category: '',
  manualNumbers: '',
  body: '',
}

function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort()
}

export function ComposeForm({
  lang,
  students,
  employees,
  offerings,
  activeAcademicYear,
  categories,
  prefillNumbers,
}: {
  lang: Lang
  students: ComposeStudentRow[]
  employees: ComposeEmployeeRow[]
  offerings: ClassCatalogueRow[]
  activeAcademicYear: number | null
  categories: string[]
  /** Guardian mobiles from `?students=` (the "Remind" action, map 013 FC2):
   *  opens in Manual Numbers mode with these, ignoring any saved draft. */
  prefillNumbers?: string
}) {
  // Restore a locally-saved draft as the initial state (client-only; no
  // server draft storage exists for this screen — see "Save Draft" below).
  // A lazy initializer rather than an effect avoids an extra render pass.
  const [draft, setDraft] = useState<Draft>(() => {
    if (prefillNumbers !== undefined) return { ...EMPTY_DRAFT, mode: 'manual', manualNumbers: prefillNumbers }
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

  const offeringOptions = useMemo(() => classCatalogueOptions(offerings), [offerings])
  const classNameOptions = useMemo(() => distinct(offerings.map((o) => o.name)), [offerings])
  const shiftOptions = useMemo(() => distinct(offerings.map((o) => o.shift)), [offerings])
  const groupOptions = useMemo(() => distinct(offerings.map((o) => o.group_department)), [offerings])
  const sectionOptions = useMemo(() => distinct(offerings.map((o) => o.section)), [offerings])

  const target = useMemo(
    () =>
      classTargetFromInput(
        {
          scope: draft.targetScope,
          offeringId: draft.offeringId,
          className: draft.className,
          shift: draft.shift,
          groupDepartment: draft.groupDepartment,
          section: draft.section,
        },
        activeAcademicYear,
      ),
    [draft.targetScope, draft.offeringId, draft.className, draft.shift, draft.groupDepartment, draft.section, activeAcademicYear],
  )

  const recipients = useMemo(
    () =>
      resolveRecipients(draft.mode, {
        students,
        employees,
        target,
        category: draft.category,
        manualNumbers: draft.manualNumbers,
      }),
    [draft.mode, draft.category, draft.manualNumbers, target, students, employees],
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
    formData.set('target_scope', draft.targetScope)
    formData.set('offering_id', draft.offeringId)
    formData.set('target_class_name', draft.className)
    formData.set('target_shift', draft.shift)
    formData.set('target_group_department', draft.groupDepartment)
    formData.set('target_section', draft.section)
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
            <label htmlFor="sms_mode" className={labelClass}>{t('sms.buildBy', lang)}</label>
            <SelectField
              id="sms_mode"
              value={draft.mode}
              onValueChange={(v) => update('mode', v as ComposeMode)}
              options={[
                { value: 'class_section', label: t('sms.modeClassSection', lang) },
                { value: 'group', label: t('sms.modeGroup', lang) },
                { value: 'manual', label: t('sms.modeManual', lang) },
              ]}
            />
          </div>

          {draft.mode === 'class_section' && (
            <>
              <div>
                <label htmlFor="sms_target_scope" className={labelClass}>{t('sms.target', lang)}</label>
                <SelectField
                  id="sms_target_scope"
                  value={draft.targetScope}
                  onValueChange={(v) => {
                    const scope = v as TargetScope
                    setDraftSaved(false)
                    setResult(null)
                    setDraft((d) => ({
                      ...d,
                      targetScope: scope,
                      // A broadcast MUST name a Class (#600) — seed it with the
                      // first option so the target is never left incomplete.
                      className: scope === 'broadcast' && !d.className ? (classNameOptions[0] ?? '') : d.className,
                    }))
                  }}
                  options={[
                    { value: 'all', label: t('sms.targetAll', lang) },
                    { value: 'offering', label: t('sms.targetOffering', lang) },
                    { value: 'broadcast', label: t('sms.targetBroadcast', lang) },
                  ]}
                />
              </div>

              {draft.targetScope === 'offering' && (
                <div className="sm:col-span-2">
                  <label htmlFor="sms_offering" className={labelClass}>{t('sms.classOffering', lang)}</label>
                  <ComboboxField
                    id="sms_offering"
                    value={draft.offeringId}
                    onValueChange={(v) => update('offeringId', v)}
                    options={[
                      { value: '', label: t('sms.selectOffering', lang) },
                      ...offeringOptions.map((o) => ({ value: o.value, label: o.label })),
                    ]}
                  />
                </div>
              )}

              {draft.targetScope === 'broadcast' && (
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="sms_target_class_name" className={labelClass}>{t('sms.class', lang)}</label>
                    <ComboboxField
                      id="sms_target_class_name"
                      value={draft.className}
                      onValueChange={(v) => update('className', v)}
                      options={[
                        { value: '', label: t('sms.selectClass', lang) },
                        ...classNameOptions.map((c) => ({ value: c, label: c })),
                      ]}
                    />
                  </div>
                  <div>
                    <label htmlFor="sms_target_shift" className={labelClass}>{t('sms.shift', lang)}</label>
                    <ComboboxField
                      id="sms_target_shift"
                      value={draft.shift}
                      onValueChange={(v) => update('shift', v)}
                      options={[
                        { value: '', label: t('sms.anyShift', lang) },
                        ...shiftOptions.map((s) => ({ value: s, label: s })),
                      ]}
                    />
                  </div>
                  <div>
                    <label htmlFor="sms_target_group_department" className={labelClass}>{t('sms.groupDepartment', lang)}</label>
                    <ComboboxField
                      id="sms_target_group_department"
                      value={draft.groupDepartment}
                      onValueChange={(v) => update('groupDepartment', v)}
                      options={[
                        { value: '', label: t('sms.anyGroup', lang) },
                        ...groupOptions.map((g) => ({ value: g, label: g })),
                      ]}
                    />
                  </div>
                  <div>
                    <label htmlFor="sms_target_section" className={labelClass}>{t('sms.section', lang)}</label>
                    <ComboboxField
                      id="sms_target_section"
                      value={draft.section}
                      onValueChange={(v) => update('section', v)}
                      options={[
                        { value: '', label: t('sms.anySection', lang) },
                        ...sectionOptions.map((s) => ({ value: s, label: s })),
                      ]}
                    />
                  </div>
                  <p className="text-xs text-muted sm:col-span-2">
                    {t('sms.academicYearPinned', lang)}: {activeAcademicYear ?? '—'}
                  </p>
                </div>
              )}
            </>
          )}

          {draft.mode === 'group' && (
            <div>
              <label htmlFor="sms_category" className={labelClass}>{t('sms.category', lang)}</label>
              <ComboboxField
                id="sms_category"
                value={draft.category}
                onValueChange={(v) => update('category', v)}
                options={[
                  { value: '', label: '—' },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
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
