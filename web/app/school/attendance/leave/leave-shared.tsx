import { formatDate, formatNumber, t, type Lang } from '@/lib/i18n'
import { Pill, type Chip } from '@/components/data-table/data-table'
import { LeaveActions } from './leave-controls'

// Shared by the Student and Employee leave lists (map 013): status pill, the
// status quick-filter chips, and the drawer body with the same approve/reject
// actions the row carries.

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected'] as const
const TONE: Record<string, 'sun' | 'mint' | 'alert'> = { pending: 'sun', approved: 'mint', rejected: 'alert' }
const KEY = {
  pending: 'attendance.leavePending',
  approved: 'attendance.leaveApproved',
  rejected: 'attendance.leaveRejected',
} as const

export function LeaveStatusPill({ status, lang }: { status: string; lang: Lang }) {
  const key = KEY[status as keyof typeof KEY]
  return (
    <Pill tone={TONE[status] ?? 'muted'} pulse={status === 'pending'}>
      {key ? t(key, lang) : status}
    </Pill>
  )
}

export const leaveStatusLabel = (status: string, lang: Lang) =>
  status in KEY ? t(KEY[status as keyof typeof KEY], lang) : status

/** One chip per status, with its count over the fetched (unfiltered-by-status) list. */
export function leaveStatusChips(leaves: { status: string }[] | Record<string, number>, lang: Lang): Chip[] {
  const countOf = (s: string) => (Array.isArray(leaves) ? leaves.filter((l) => l.status === s).length : (leaves[s] ?? 0))
  return LEAVE_STATUSES.map((s) => ({
    param: 'status',
    value: s,
    label: `${t(KEY[s], lang)} (${formatNumber(countOf(s), lang)})`,
  }))
}

export function LeaveDetail({
  kind,
  leave,
  facts,
  lang,
}: {
  kind: 'student' | 'employee'
  leave: {
    id: string
    from_day: string
    to_day: string
    reason: string | null
    status: string
    decision_note?: string | null
    decided_at?: string | null
  }
  /** Holder facts shown above the dates, e.g. roll and class. */
  facts: { label: string; value: string }[]
  lang: Lang
}) {
  const rows = [
    ...facts,
    { label: t('attendance.leaveFromCol', lang), value: formatDate(leave.from_day, lang) },
    { label: t('attendance.leaveToCol', lang), value: formatDate(leave.to_day, lang) },
    { label: t('attendance.leaveReasonCol', lang), value: leave.reason ?? '—' },
    // Present only once migration 0219 is applied and the leave was decided after it.
    ...(leave.decided_at
      ? [{ label: t('attendance.leaveDecidedOn', lang), value: formatDate(leave.decided_at, lang) }]
      : []),
    ...(leave.decision_note
      ? [{ label: t('attendance.leaveRejectReason', lang), value: leave.decision_note }]
      : []),
  ]
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted">{r.label}</dt>
            <dd className="whitespace-pre-wrap break-words">{r.value}</dd>
          </div>
        ))}
        <dt className="text-muted">{t('attendance.leaveStatusCol', lang)}</dt>
        <dd>
          <LeaveStatusPill status={leave.status} lang={lang} />
        </dd>
      </dl>
      {leave.status === 'pending' && (
        <div className="border-t border-line pt-4">
          <LeaveActions kind={kind} id={leave.id} lang={lang} />
        </div>
      )}
    </div>
  )
}
