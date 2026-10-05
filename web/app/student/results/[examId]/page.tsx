import { ClipboardList, Trophy } from 'lucide-react'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, formatNumber } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { loadGradingScheme } from '@/lib/grading-scheme-loader'
import { groupByExam, evaluateExam, type ResultRow } from '@/lib/student/results'
import { rawResult, resultMode } from '@/lib/student/result-fallback'
import { studentGroupTabs } from '@/lib/student-nav'
import { PrintTrigger } from '@/components/print/print-trigger'
import { Card, PageHeader, thClass, tdClass, trClass } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { StatCard, StatGrid } from '@/components/ui/widgets'

// One published exam's result (#449).
//
// Grading is not recomputed here — lib/grading.ts is the authority and is
// unit-tested. Rank comes from student_exam_rank (0143), a definer function
// returning only the caller's own position, because computing it needs every
// student's totals and a Student must not be able to read those.
//
// A student login cannot read grading_schemes / grade_bands (#702), so `scheme`
// is null today and the page falls back to raw marks (lib/student/result-fallback.ts):
// no grade, GPA or pass/fail, and no print link, because the print route needs
// the scheme and would 404. When the policy is fixed the graded path below
// runs as before.
export default async function StudentResultPage({
  params,
}: {
  params: Promise<{ examId: string }>
}) {
  const { examId } = await params
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase.from('student_exam_result').select('*').eq('exam_id', examId)
  const [exam] = groupByExam((data ?? []) as ResultRow[])
  if (!exam) notFound()

  const scheme = exam.gradingSchemeId
    ? await loadGradingScheme(supabase, exam.gradingSchemeId)
    : null
  const { data: rankRows } = await supabase.rpc('student_exam_rank', { p_exam: examId })
  const rank = (rankRows as { rank: number; out_of: number }[] | null)?.[0] ?? null

  const evaluated = scheme ? evaluateExam(exam, scheme) : null
  // A subject with no mark makes the result incomplete — the same reading as
  // the school's Result Book and mark sheet: no GPA, no pass/fail, no position.
  const { data: classSubjects } = await supabase.from('student_subject_option').select('id, name').order('name')
  const raw = rawResult(exam, (classSubjects ?? []) as { id: string; name: string }[])
  const missing = raw.missing
  const incomplete = missing.length > 0
  const graded = resultMode(scheme) === 'graded'

  const fmt = (n: number) => formatNumber(n, lang, { maximumFractionDigits: 2 })
  const rankCard = rank && !incomplete && (
    <StatCard
      icon={<Trophy className="size-5" />}
      tone="brand"
      label={t('student.rank', lang)}
      value={`${fmt(rank.rank)} / ${fmt(rank.out_of)}`}
    />
  )

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={exam.examName}
        crumbs={{
          lang,
          items: [
            { label: t('student.nav.home', lang), href: '/student' },
            { label: t('student.nav.results', lang), href: '/student/results' },
            { label: exam.examName },
          ],
        }}
        backHref="/student/results"
        backLabel={t('student.resultsTitle', lang)}
        badge={formatNumber(exam.examYear, lang, { useGrouping: false })}
        actions={
          graded && (
            <PrintTrigger href={`/student/results/${examId}/print`} label={t('student.printMarkSheet', lang)} />
          )
        }
      />
      <SectionTabs
        tabs={studentGroupTabs('exams')}
        active="/student/results"
        lang={lang}
        label={t('student.navGroup.exams', lang)}
      />

      {evaluated ? (
        // The graded tiles keep their original markup: this is the path that
        // runs once the grading policy is fixed (#702) and must not change.
        <section className="mb-section grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="text-xl font-extrabold text-brand-700">
              {incomplete ? '—' : (evaluated.overall.gpa ?? '—')}
            </div>
            <div className="text-xs text-muted">{t('student.gpa', lang)}</div>
          </div>
          <div className="rounded-lg border border-line bg-paper p-4">
            <div className="text-xl font-extrabold">{incomplete ? '—' : (evaluated.overall.label ?? '—')}</div>
            <div className="text-xs text-muted">{t('student.grade', lang)}</div>
          </div>
          <div className="rounded-lg border border-line bg-paper p-4">
            <div
              className={`text-xl font-extrabold ${incomplete ? 'text-sun-deep' : evaluated.overall.passed ? 'text-mint-deep' : 'text-alert-deep'}`}
            >
              {t(incomplete ? 'exams.incomplete' : evaluated.overall.passed ? 'student.passed' : 'student.failed', lang)}
            </div>
          </div>
          {rank && !incomplete && (
            <div className="rounded-lg border border-line bg-paper p-4">
              <div className="text-xl font-extrabold">
                {rank.rank}
                <span className="text-sm text-muted"> / {rank.out_of}</span>
              </div>
              <div className="text-xs text-muted">{t('student.rank', lang)}</div>
            </div>
          )}
        </section>
      ) : (
        <>
          <Card tone="sun" className="mb-section">
            <p className="text-sm font-semibold text-sun-deep">{t('student.gradeUnavailable', lang)}</p>
            {incomplete && <p className="mt-1 text-sm text-muted">{t('exams.incomplete', lang)}</p>}
          </Card>
          <StatGrid>
            <StatCard
              icon={<ClipboardList className="size-5" />}
              tone="brand"
              label={t('student.dash.totalMarks', lang)}
              value={`${fmt(raw.total.obtained)} / ${fmt(raw.total.full)}`}
              progress={raw.total.full ? (raw.total.obtained / raw.total.full) * 100 : undefined}
            />
            {raw.showRank && rankCard}
          </StatGrid>
        </>
      )}

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={thClass}>{t('student.subject', lang)}</th>
                <th className={thClass}>{t('student.marks', lang)}</th>
                {graded && <th className={thClass}>{t('student.grade', lang)}</th>}
              </tr>
            </thead>
            <tbody>
              {evaluated
                ? evaluated.subjects.map((s) => (
                    <tr key={s.subjectId} className={trClass}>
                      <td className={`${tdClass} font-medium`}>{s.subjectName}</td>
                      <td className={tdClass}>
                        {fmt(s.obtainedMarks)} <span className="text-muted">/ {fmt(s.fullMarks)}</span>
                      </td>
                      <td className={tdClass}>
                        {s.label ?? '—'}
                        {s.gradePoint !== null && <span className="ml-1 text-xs text-muted">({fmt(s.gradePoint)})</span>}
                      </td>
                    </tr>
                  ))
                : raw.subjects.map((s) => (
                    <tr key={s.id} className={trClass}>
                      <td className={`${tdClass} font-medium`}>{s.name}</td>
                      <td className={tdClass}>
                        {fmt(s.obtained)} <span className="text-muted">/ {fmt(s.full)}</span>
                      </td>
                    </tr>
                  ))}
              {missing.map((s) => (
                <tr key={s.id} className={trClass}>
                  <td className={`${tdClass} font-medium`}>{s.name}</td>
                  <td className={`${tdClass} text-muted`}>—</td>
                  {graded && <td className={`${tdClass} text-sun-deep`}>{t('exams.marksNotEntered', lang)}</td>}
                </tr>
              ))}
              {!evaluated && (
                <tr className="border-t border-line font-bold">
                  <td className={tdClass}>{t('student.dash.totalMarks', lang)}</td>
                  <td className={tdClass}>
                    {fmt(raw.total.obtained)} <span className="font-normal text-muted">/ {fmt(raw.total.full)}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  )
}
