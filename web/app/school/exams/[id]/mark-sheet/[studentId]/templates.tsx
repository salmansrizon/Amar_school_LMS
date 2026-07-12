import {
  PrintPage,
  InstituteHeader,
  InfoGrid,
  GradePanelRow,
  SignatureRow,
  QrFooterRow,
  QrMark,
  Badge,
} from '@/components/print/pieces'
import { t, type Lang } from '@/lib/i18n'
import type { SchemeType } from '@/lib/grading'

// Exams IV (issue #33, PRD §5.5): the 3 mark-sheet template variants. All
// three render the exact same computed data (grading.ts grades, exam-
// results.ts rank) — they differ only in layout/visual treatment, matching
// the mockup's template <select> being a pure display choice. Template 1
// reproduces mark-sheet-preview.html structure exactly (the "strict
// reference"); 2 and 3 are original variants built on the same pieces, and
// are where the class-rank figure (rankResults, not shown in the mockup) is
// surfaced.

export interface MarkSheetSubjectRow {
  subjectId: string
  name: string
  full: number
  obtained: number
  label: string | null
  gpa: number | null
  passed: boolean
}

export interface MarkSheetTemplateProps {
  lang: Lang
  schoolName: string
  schoolMeta?: string
  examLabel: string
  studentName: string
  roll: string
  classSection: string
  guardianName: string
  schemeType: SchemeType
  subjectRows: MarkSheetSubjectRow[]
  totalFull: number
  totalObtained: number
  overallGpa: number | null
  overallLabel: string | null
  overallPassed: boolean
  rankPosition: number | null
  rankOutOf: number
  qrSvg: string
  template: 1 | 2 | 3
}

function GradeBadge({ label, passed }: { label: string | null; passed: boolean }) {
  if (!label) return <span className="text-muted">—</span>
  return <Badge tone={passed ? 'success' : 'alert'}>{label}</Badge>
}

function baseInfoRows(props: MarkSheetTemplateProps) {
  return [
    { label: t('markSheet.studentName', props.lang), value: props.studentName },
    { label: t('markSheet.roll', props.lang), value: props.roll },
    { label: t('markSheet.classSection', props.lang), value: props.classSection },
    { label: t('markSheet.fatherName', props.lang), value: props.guardianName },
  ]
}

function SubjectTable({ props, showGradeColumns }: { props: MarkSheetTemplateProps; showGradeColumns: boolean }) {
  const { lang, subjectRows } = props
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
          <th className="py-2 pr-2 font-semibold">{t('markSheet.subject', lang)}</th>
          <th className="py-2 pr-2 font-semibold">{t('markSheet.fullMarks', lang)}</th>
          <th className="py-2 pr-2 font-semibold">{t('markSheet.obtained', lang)}</th>
          {showGradeColumns && (
            <>
              <th className="py-2 pr-2 font-semibold">{t('markSheet.grade', lang)}</th>
              <th className="py-2 font-semibold">{t('markSheet.gpa', lang)}</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {subjectRows.map((s) => (
          <tr key={s.subjectId} className="border-b border-line">
            <td className="py-2 pr-2">{s.name}</td>
            <td className="py-2 pr-2">{s.full}</td>
            <td className="py-2 pr-2">{s.obtained}</td>
            {showGradeColumns && (
              <>
                <td className="py-2 pr-2">
                  <GradeBadge label={s.label} passed={s.passed} />
                </td>
                <td className="py-2">{s.gpa !== null ? s.gpa.toFixed(2) : '—'}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Template 1 — Classic: the exact structure of mark-sheet-preview.html /
 * the issue #25 POC page. No rank line (the mockup doesn't show one). */
function ClassicTemplate(props: MarkSheetTemplateProps) {
  const { lang } = props
  const showGradeColumns = props.schemeType !== 'numeric'
  return (
    <PrintPage>
      <InstituteHeader
        name={props.schoolName}
        meta={props.schoolMeta}
        docTitle={`${t('markSheet.docWord', lang)} — ${props.examLabel}`}
      />
      <InfoGrid rows={baseInfoRows(props)} />
      <SubjectTable props={props} showGradeColumns={showGradeColumns} />
      <GradePanelRow>
        <span>
          {t('markSheet.totalMarks', lang)} {props.totalObtained} / {props.totalFull}
        </span>
        {showGradeColumns && (
          <span>
            {t('markSheet.overallGpa', lang)} {props.overallGpa !== null ? props.overallGpa.toFixed(2) : '—'}
          </span>
        )}
        <Badge tone={props.overallPassed ? 'success' : 'alert'}>
          {props.overallPassed ? t('markSheet.pass', lang) : t('promotion.fail', lang)}
        </Badge>
      </GradePanelRow>
      <SignatureRow
        labels={[t('markSheet.classTeacher', lang), t('markSheet.examController', lang), t('markSheet.headTeacher', lang)]}
      />
      <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qr={<QrMark svg={props.qrSvg} />} />
    </PrintPage>
  )
}

/** Template 2 — Bordered/Compact: the subject table sits inside a bordered
 * box and the merit position (rankResults, exam-results.ts) is surfaced as
 * an extra info row — same data as Template 1, denser visual treatment. */
function BorderedTemplate(props: MarkSheetTemplateProps) {
  const { lang } = props
  const showGradeColumns = props.schemeType !== 'numeric'
  const rows = baseInfoRows(props)
  if (props.rankPosition !== null) {
    rows.push({ label: t('promotion.position', lang), value: `${props.rankPosition} / ${props.rankOutOf}` })
  }
  return (
    <PrintPage>
      <InstituteHeader
        name={props.schoolName}
        meta={props.schoolMeta}
        docTitle={`${t('markSheet.docWord', lang)} — ${props.examLabel}`}
      />
      <InfoGrid rows={rows} />
      <div className="rounded-md border-2 border-line-strong p-3">
        <SubjectTable props={props} showGradeColumns={showGradeColumns} />
      </div>
      <GradePanelRow>
        <span>
          {t('markSheet.totalMarks', lang)} {props.totalObtained} / {props.totalFull}
        </span>
        {showGradeColumns && (
          <span>
            {t('markSheet.overallGpa', lang)} {props.overallGpa !== null ? props.overallGpa.toFixed(2) : '—'}
          </span>
        )}
        <Badge tone={props.overallPassed ? 'success' : 'alert'}>
          {props.overallPassed ? t('markSheet.pass', lang) : t('promotion.fail', lang)}
        </Badge>
      </GradePanelRow>
      <SignatureRow
        labels={[t('markSheet.classTeacher', lang), t('markSheet.examController', lang), t('markSheet.headTeacher', lang)]}
      />
      <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qr={<QrMark svg={props.qrSvg} />} />
    </PrintPage>
  )
}

/** Template 3 — Result Card: a highlighted result summary sits right under
 * the student info (before the subject table), with the rank folded into
 * the same card — the most "certificate-like" of the three variants. */
function ResultCardTemplate(props: MarkSheetTemplateProps) {
  const { lang } = props
  const showGradeColumns = props.schemeType !== 'numeric'
  return (
    <PrintPage>
      <InstituteHeader
        name={props.schoolName}
        meta={props.schoolMeta}
        docTitle={`${t('markSheet.docWord', lang)} — ${props.examLabel}`}
      />
      <InfoGrid rows={baseInfoRows(props)} />
      <div className="mb-5 flex items-center justify-between rounded-md bg-paper-muted px-4 py-3">
        <div className="flex gap-6 text-sm font-semibold">
          <span>
            {t('markSheet.totalMarks', lang)} {props.totalObtained} / {props.totalFull}
          </span>
          {showGradeColumns && (
            <span>
              {t('markSheet.overallGpa', lang)} {props.overallGpa !== null ? props.overallGpa.toFixed(2) : '—'}
            </span>
          )}
          {props.rankPosition !== null && (
            <span>
              {t('promotion.position', lang)} {props.rankPosition} / {props.rankOutOf}
            </span>
          )}
        </div>
        <Badge tone={props.overallPassed ? 'success' : 'alert'}>
          {props.overallPassed ? t('markSheet.pass', lang) : t('promotion.fail', lang)}
        </Badge>
      </div>
      <SubjectTable props={props} showGradeColumns={showGradeColumns} />
      <SignatureRow labels={[t('markSheet.classTeacher', lang), t('markSheet.headTeacher', lang)]} />
      <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} qr={<QrMark svg={props.qrSvg} />} />
    </PrintPage>
  )
}

export function MarkSheetTemplate(props: MarkSheetTemplateProps) {
  if (props.template === 2) return <BorderedTemplate {...props} />
  if (props.template === 3) return <ResultCardTemplate {...props} />
  return <ClassicTemplate {...props} />
}
