'use client'

import { useMemo, useState, useTransition } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { selectClass } from '@/components/ui/field'
import { countSmsSegments } from '@/lib/sms/segments'
import {
  schoolsUnderLocation,
  schoolSmsRecipients,
  type ClusterEdge,
  type LocationEdge,
  type SchoolRecipientRow,
} from '@/lib/super-admin/school-recipients'
import { sendSuperAdminSms, type SendResult } from './actions'

export interface LocationOption {
  id: string
  label: string
  depth: number
}

const btn =
  'h-10 cursor-pointer rounded-full bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'

export function SmsComposer({
  locationOptions,
  schools,
  locations,
  clusters,
  lang,
}: {
  locationOptions: LocationOption[]
  schools: SchoolRecipientRow[]
  locations: LocationEdge[]
  clusters: ClusterEdge[]
  lang: Lang
}) {
  const [locationId, setLocationId] = useState('')
  const [body, setBody] = useState('')
  const [result, setResult] = useState<SendResult | null>(null)
  const [pending, startTransition] = useTransition()

  const recipients = useMemo(
    () => schoolSmsRecipients(schoolsUnderLocation(schools, locations, clusters, locationId || null)),
    [schools, locations, clusters, locationId],
  )
  const segments = body.trim() ? countSmsSegments(body).segments || 1 : 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('sa.sms.location', lang)}</label>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={selectClass({ fullWidth: true })}>
          <option value="">{t('sa.sms.allLocations', lang)}</option>
          {locationOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {' '.repeat(o.depth * 2)}
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">{t('sa.sms.message', lang)}</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="w-full rounded-sm border border-line-strong bg-paper p-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
        <span>
          {t('sa.sms.recipients', lang)}: <strong className="text-ink">{recipients.length}</strong>
        </span>
        <span>
          {t('sa.sms.segments', lang)}: <strong className="text-ink">{segments}</strong>
        </span>
      </div>

      {recipients.length === 0 && body.trim() && (
        <p className="text-sm text-alert-deep">{t('sa.sms.noRecipients', lang)}</p>
      )}

      <button
        type="button"
        disabled={pending || !body.trim() || recipients.length === 0}
        className={btn}
        onClick={() =>
          startTransition(async () => {
            setResult(null)
            const r = await sendSuperAdminSms(locationId || null, body)
            setResult(r)
            if (!r.error) setBody('')
          })
        }
      >
        {t('sa.sms.send', lang)}
      </button>

      {result?.error && <p className="text-sm text-alert-deep">{result.error}</p>}
      {result && !result.error && (
        <p className="text-sm text-mint-deep">
          {t('sa.sms.result', lang)}: {t('sa.sms.sent', lang)} {result.sent} · {t('sa.sms.failed', lang)} {result.failed}
        </p>
      )}
    </div>
  )
}
