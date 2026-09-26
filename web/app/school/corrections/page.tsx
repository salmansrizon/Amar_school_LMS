import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang, type MessageKey } from '@/lib/i18n'
import { storedFieldLabel } from '@/lib/students/stored-labels'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { sortRequests, isPhotoRequest, type CorrectionRequest } from '@/lib/student/corrections'
import { hubSummary } from '@/lib/student/hub-source'
import { waitingHours, waitingTone } from '@/lib/student/hub'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { paginate, pageSizeFrom } from '@/components/pager'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { HubTabs } from '../messages-hub-tabs'
import { ResolveButtons } from './resolve-buttons'

// The Corrections tab of বার্তা ও অনুরোধ (#456 queue, #509 section), on the
// DataTable (map 013 FC4) with a drawer to review and apply/reject.
//
// Applying goes through apply_profile_change_request, never a raw update: the
// write to `students` and the resolution of the request must not be able to come
// apart, and the whitelist is re-checked where the pen actually is.
//
// Reading is now scoped by class attachment (0152) and applying is still
// owner-only — ADR 0018 widened who may look at the queue, not who may act on
// it. A Class Teacher seeing a pending request she cannot apply is the point:
// she is the one who knows whether the new phone number is right.

const FIELD_LABELS: Record<string, MessageKey> = {
  student_mobile: 'students.studentMobile',
  blood_group: 'students.bloodGroup',
  religion: 'students.religion',
  address: 'students.address',
  guardian_name: 'students.guardianName',
  guardian_relation: 'students.relation',
  guardian_mobile: 'students.guardianMobile',
  photo_path: 'students.photo',
}

interface RequestStudent {
  full_name: string
  roll_number: number | null
  class_name: string | null
  section: string | null
}

type Row = CorrectionRequest & { student?: RequestStudent }

/** PostgREST returns an embedded one-to-one as an object, but types it as a
 *  union with an array. One place to unwrap it. */
function studentOf(row: { students?: RequestStudent | RequestStudent[] | null }): RequestStudent | undefined {
  return Array.isArray(row.students) ? row.students[0] : (row.students ?? undefined)
}

const PAGE_SIZE = 20

export default async function CorrectionsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', status = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const fmt = numberFmt(lang)
  const { supabase, role } = await getSchoolContext()

  const { data } = await supabase
    .from('student_profile_change_requests')
    .select(
      'id, student_id, field, current_value, requested_value, note, status, reject_reason, created_at, resolved_at, students(full_name, roll_number, class_name, section)',
    )
    .order('created_at', { ascending: false })
    .limit(300)

  const raw = (data ?? []) as unknown as (CorrectionRequest & { students?: RequestStudent | RequestStudent[] })[]
  const byId = new Map(raw.map((r) => [r.id, studentOf(r)]))
  const requests: Row[] = sortRequests(raw as CorrectionRequest[]).map((r) => ({ ...r, student: byId.get(r.id) }))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const count = (s: CorrectionRequest['status']) => requests.filter((r) => r.status === s).length

  const summary = await hubSummary(supabase, { skip: 'corrections', known: count('pending') })

  const needle = q.trim().toLowerCase()
  const shown = requests.filter(
    (r) => (!status || r.status === status) && (!needle || (r.student?.full_name ?? '').toLowerCase().includes(needle)),
  )
  const pageData = paginate(shown, page, pageSize)
  const viewed = view ? (requests.find((r) => r.id === view) ?? null) : null

  const fieldLabel = (r: Row) => t(FIELD_LABELS[r.field] ?? 'students.name', lang)
  const who = (r: Row) =>
    [
      r.student?.class_name && `${r.student.class_name}${r.student.section ? ` ${r.student.section}` : ''}`,
      r.student?.roll_number != null && `#${r.student.roll_number}`,
    ]
      .filter(Boolean)
      .join(' · ')
  // A resolved request is settled whichever way it went; `resolved_at` is what
  // waitingTone reads, so rejected reads as mint too.
  const statusPill = (r: Row) => {
    const tone = waitingTone({ created_at: r.created_at, replied_at: r.resolved_at, status: r.status })
    const hours = waitingHours({ created_at: r.created_at, replied_at: r.resolved_at })
    const label =
      r.status === 'pending'
        ? hours < 1
          ? t('hub.freshlyAsked', lang)
          : `${hours}${t('hub.waitingHours', lang)}`
        : t(r.status === 'applied' ? 'student.reqApplied' : 'student.reqRejected', lang)
    return <Pill tone={r.status === 'rejected' ? 'muted' : (tone ?? 'muted')}>{label}</Pill>
  }
  // The requested field is free-form, so translate by field name — a
  // guardian_relation request otherwise reads `father` -> `Father` mid-Bangla (#539).
  const change = (r: Row) =>
    isPhotoRequest(r) ? (
      <span className="text-muted">{t('student.newPhoto', lang)}</span>
    ) : (
      <>
        <span className="text-muted">
          {t('corrections.was', lang)}: {storedFieldLabel(r.field, r.current_value, lang) || '—'}
        </span>
        <span className="ml-2">
          {t('corrections.becomes', lang)}: <strong>{storedFieldLabel(r.field, r.requested_value, lang)}</strong>
        </span>
      </>
    )

  const columns: Column<Row>[] = [
    {
      key: 'student',
      header: t('questions.colStudent', lang),
      card: 'title',
      cell: (r) => (
        <div>
          <p className="font-semibold">{r.student?.full_name ?? '—'}</p>
          <p className="text-xs text-muted">{who(r)}</p>
        </div>
      ),
    },
    { key: 'status', header: t('questions.colStatus', lang), card: 'badge', cell: statusPill },
    { key: 'field', header: t('corrections.colField', lang), cell: fieldLabel },
    { key: 'change', header: t('corrections.colChange', lang), card: 'hidden', className: 'text-sm', cell: change },
    {
      key: 'date',
      header: t('questions.colAsked', lang),
      cell: (r) => new Date(r.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('hub.title', lang)}
        crumbs={schoolCrumbs('/school/corrections', lang, [
          { label: t('hub.title', lang), href: '/school/questions' },
          { label: t('hub.tabCorrections', lang) },
        ])}
        badge={`${t('pager.total', lang)}: ${fmt.format(requests.length)}`}
      />
      <HubTabs active="/school/corrections" lang={lang} summary={summary} />

      <StatGrid>
        <StatCard
          icon={<Clock className="size-5" />}
          tone="sun"
          label={t('corrections.statPending', lang)}
          value={fmt.format(count('pending'))}
          action={{ href: '/school/corrections?status=pending', label: t('notices.view', lang) }}
        />
        <StatCard icon={<CheckCircle2 className="size-5" />} tone="mint" label={t('student.reqApplied', lang)} value={fmt.format(count('applied'))} />
        <StatCard icon={<XCircle className="size-5" />} tone="muted" label={t('student.reqRejected', lang)} value={fmt.format(count('rejected'))} />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(r) => r.id}
        rowLabel={(r) => `${r.student?.full_name ?? '—'}: ${fieldLabel(r)}`}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('hub.tabCorrections', lang)}
        search={{ placeholder: t('corrections.search', lang) }}
        filters={[
          {
            param: 'status',
            label: t('questions.colStatus', lang),
            options: [
              { value: 'pending', label: t('student.reqPending', lang) },
              { value: 'applied', label: t('student.reqApplied', lang) },
              { value: 'rejected', label: t('student.reqRejected', lang) },
            ],
          },
        ]}
        chips={[{ param: 'status', value: 'pending', label: t('student.reqPending', lang) }]}
        rowActions={(r) => (
          <ViewLink
            id={r.id}
            params={params}
            label={r.status === 'pending' && role === 'school_owner' ? t('corrections.review', lang) : t('notices.view', lang)}
            name={`${r.student?.full_name ?? '—'}: ${fieldLabel(r)}`}
          />
        )}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          <Card>
            <p className="text-sm text-muted">
              {summary.reachesAnyClass ? t('corrections.none', lang) : t('hub.noClasses', lang)}
            </p>
          </Card>
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed ? fieldLabel(viewed) : ''}
        subtitle={viewed ? [viewed.student?.full_name, who(viewed)].filter(Boolean).join(' · ') : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {statusPill(viewed)}
              <span>{new Date(viewed.created_at).toLocaleString(locale)}</span>
            </div>
            <Card>
              <p className="text-sm">{change(viewed)}</p>
              {viewed.note && <p className="mt-2 text-xs italic text-muted">{viewed.note}</p>}
            </Card>
            {viewed.status === 'pending' ? (
              role === 'school_owner' ? (
                <ResolveButtons lang={lang} requestId={viewed.id} />
              ) : (
                <p className="text-xs text-muted">{t('student.reqPending', lang)}</p>
              )
            ) : (
              <p className="text-xs text-muted">
                {t(viewed.status === 'applied' ? 'student.reqApplied' : 'student.reqRejected', lang)}
                {viewed.reject_reason && ` — ${viewed.reject_reason}`}
              </p>
            )}
          </div>
        )}
      </RecordDrawer>
    </>
  )
}
