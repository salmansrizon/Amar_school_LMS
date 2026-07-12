import {
  PrintPage,
  InstituteHeader,
  InfoGrid,
  SectionTitle,
  KeyValueTable,
  ChecklistGrid,
  QrFooterRow,
  QrMark,
  Badge,
} from '@/components/print/pieces'
import { t, type Lang } from '@/lib/i18n'
import type { RatingBand } from '@/lib/behaviour'

// Exams IV (issue #33, PRD §5.5): the 3 progress-report template variants.
// Template 1 reproduces progress-report-preview.html's structure exactly
// (the "strict reference"); 2 and 3 are original variants on the same data
// and pieces — 2 adds the class-rank figure (exam-results.ts's rankResults,
// not in the mockup), 3 lays the Behaviour/Co-curricular sections side by
// side instead of stacked.

export interface ProgressReportSubjectRow {
  subjectId: string
  name: string
  full: number
  obtained: number
  label: string | null
  passed: boolean
}

export interface BehaviourRow {
  id: string
  note: string
  band: RatingBand
}

export interface ChecklistRow {
  id: string
  label: string
  checked: boolean
}

export interface ProgressReportTemplateProps {
  lang: Lang
  schoolName: string
  examLabel: string
  studentName: string
  roll: string
  classSection: string
  attendancePercent: number | null
  subjectRows: ProgressReportSubjectRow[]
  behaviourRows: BehaviourRow[]
  checklistItems: ChecklistRow[]
  rankPosition: number | null
  rankOutOf: number
  qrSvg: string
  template: 1 | 2 | 3
}

const BAND_TONE = { excellent: 'success', good: 'info', needsImprovement: 'alert' } as const
const BAND_KEY = {
  excellent: 'progressReport.ratingExcellent',
  good: 'progressReport.ratingGood',
  needsImprovement: 'progressReport.ratingNeedsImprovement',
} as const

function bandBadge(band: RatingBand, lang: Lang) {
  return <Badge tone={BAND_TONE[band]}>{t(BAND_KEY[band], lang)}</Badge>
}

function baseInfoRows(props: ProgressReportTemplateProps) {
  return [
    { label: t('markSheet.studentName', props.lang), value: props.studentName },
    { label: t('markSheet.roll', props.lang), value: props.roll },
    { label: t('markSheet.classSection', props.lang), value: props.classSection },
    {
      label: t('progressReport.attendance', props.lang),
      value: props.attendancePercent !== null ? `${props.attendancePercent}%` : '—',
    },
  ]
}

function SubjectTable({ rows, lang }: { rows: ProgressReportSubjectRow[]; lang: Lang }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
          <th className="py-2 pr-2 font-semibold">{t('markSheet.subject', lang)}</th>
          <th className="py-2 pr-2 font-semibold">{t('markSheet.obtained', lang)}</th>
          <th className="py-2 font-semibold">{t('markSheet.grade', lang)}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.subjectId} className="border-b border-line">
            <td className="py-2 pr-2">{s.name}</td>
            <td className="py-2 pr-2">
              {s.obtained} / {s.full}
            </td>
            <td className="py-2">{s.label ? <Badge tone={s.passed ? 'success' : 'alert'}>{s.label}</Badge> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BehaviourSection({ props }: { props: ProgressReportTemplateProps }) {
  const { lang, behaviourRows } = props
  return (
    <>
      <SectionTitle>{t('progressReport.behaviourRating', lang)}</SectionTitle>
      {behaviourRows.length ? (
        <KeyValueTable
          headers={[t('progressReport.criteria', lang), t('progressReport.rating', lang)]}
          rows={behaviourRows.map((r) => ({ key: r.id, label: r.note, value: bandBadge(r.band, lang) }))}
        />
      ) : (
        <p className="text-sm text-muted">{t('progressReport.noBehaviourEntries', lang)}</p>
      )}
    </>
  )
}

function ChecklistSection({ props }: { props: ProgressReportTemplateProps }) {
  const { lang, checklistItems } = props
  return (
    <>
      <SectionTitle>{t('cocurricular.title', lang)}</SectionTitle>
      {checklistItems.length ? (
        <ChecklistGrid items={checklistItems} />
      ) : (
        <p className="text-sm text-muted">{t('progressReport.noChecklistItems', lang)}</p>
      )}
    </>
  )
}

/** Template 1 — Classic: matches progress-report-preview.html exactly. */
function ClassicTemplate(props: ProgressReportTemplateProps) {
  const { lang } = props
  return (
    <PrintPage>
      <InstituteHeader name={props.schoolName} docTitle={`${t('progressReport.docWord', lang)} — ${props.examLabel}`} />
      <InfoGrid rows={baseInfoRows(props)} />
      <SubjectTable rows={props.subjectRows} lang={lang} />
      <BehaviourSection props={props} />
      <ChecklistSection props={props} />
      <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qr={<QrMark svg={props.qrSvg} />} />
    </PrintPage>
  )
}

/** Template 2 — Bordered: same sections, boxed subject table + the class
 * rank (exam-results.ts's rankResults) added as an extra info row. */
function BorderedTemplate(props: ProgressReportTemplateProps) {
  const { lang } = props
  const rows = baseInfoRows(props)
  if (props.rankPosition !== null) {
    rows.push({ label: t('promotion.position', lang), value: `${props.rankPosition} / ${props.rankOutOf}` })
  }
  return (
    <PrintPage>
      <InstituteHeader name={props.schoolName} docTitle={`${t('progressReport.docWord', lang)} — ${props.examLabel}`} />
      <InfoGrid rows={rows} />
      <div className="rounded-md border-2 border-line-strong p-3">
        <SubjectTable rows={props.subjectRows} lang={lang} />
      </div>
      <BehaviourSection props={props} />
      <ChecklistSection props={props} />
      <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qr={<QrMark svg={props.qrSvg} />} />
    </PrintPage>
  )
}

/** Template 3 — Side-by-side: Behaviour Rating and Co-curricular Checklist
 * sit in a 2-column grid instead of stacked, a more compact single-sheet
 * layout. */
function SideBySideTemplate(props: ProgressReportTemplateProps) {
  const { lang } = props
  return (
    <PrintPage>
      <InstituteHeader name={props.schoolName} docTitle={`${t('progressReport.docWord', lang)} — ${props.examLabel}`} />
      <InfoGrid rows={baseInfoRows(props)} />
      <SubjectTable rows={props.subjectRows} lang={lang} />
      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <BehaviourSection props={props} />
        </div>
        <div>
          <ChecklistSection props={props} />
        </div>
      </div>
      <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qr={<QrMark svg={props.qrSvg} />} />
    </PrintPage>
  )
}

export function ProgressReportTemplate(props: ProgressReportTemplateProps) {
  if (props.template === 2) return <BorderedTemplate {...props} />
  if (props.template === 3) return <SideBySideTemplate {...props} />
  return <ClassicTemplate {...props} />
}
