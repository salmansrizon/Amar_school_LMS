import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { subjectsForClass } from '@/lib/students'
import { subjectFullMarks } from '@/lib/exam-setup'
import { evaluateSubject, evaluateOverallResult, subjectPercent, type GradingScheme, type OverallResult, type SubjectMark } from '@/lib/grading'
import { loadGradingScheme } from '@/lib/grading-scheme-loader'
import {
  combineBySum,
  combineByWeightedPercent,
  evaluateCombinedPercent,
  rankResults,
  resolveMemberWeights,
  type ExamPercent,
  type ExamSubjectMark,
  type RankableResult,
  type RankBasis,
} from '@/lib/exam-results'
import {
  FinalClassToggle,
  GraduatingSection,
  PromotionTable,
  ResultControlsBar,
  type ClassOption,
  type CombinationOption,
  type PromotionStudentRow,
} from './promotion-controls'

// Layout per ui/school-owner/promotion-transfer.html: result-source + rank-
// basis toolbar over the Promote-selected table, with the Graduating Batch /
// "Make Old" section below. Pass/fail and GPA reuse evaluateSubject/
// evaluateOverallResult (web/lib/grading.ts, issue #31) — the "optional-
// subject rules" this ticket asks for are already implemented there, not
// rebuilt here. When the toolbar's result source is a saved multi-exam
// combination (web/app/school/exams/combinations) instead of "this exam
// only", the combine math is web/lib/exam-results.ts's combineBySum /
// combineByWeightedPercent + resolveMemberWeights (PRD's "remainder
// auto-assigned").

type ComboMember = { exam_id: string; weight_percent: number | null }

export default async function PromotionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ source?: string; basis?: string }>
}) {
  const { id } = await params
  const { source: sourceParam = 'exam', basis: basisParam } = await searchParams
  const basis: RankBasis = basisParam === 'mark' ? 'mark' : 'grade'
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, status, class_id, grading_scheme_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const examLabel = `${exam.name} (${exam.exam_year})`

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">
        {t('promotion.title', lang)} — {examLabel}
      </h1>
      <Link href={`/school/exams/${exam.id}`} className="text-sm text-brand-600 hover:underline">
        ← {t('examSetup.title', lang)}
      </Link>
    </div>
  )

  if (!exam.class_id) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('promotion.noClassSet', lang)}
        </p>
      </main>
    )
  }

  const { data: cls } = await supabase
    .from('classes')
    .select('name, section, is_final_class')
    .eq('id', exam.class_id)
    .maybeSingle()
  const [{ data: allClasses }, { data: allSubjects }, { data: combos }] = await Promise.all([
    supabase.from('classes').select('id, name, section').order('created_at'),
    supabase.from('subjects').select('id, name, class_id, theory_marks, mcq_marks, practical_marks').order('name'),
    supabase
      .from('exam_combinations')
      .select('id, name, class_id, strategy, grading_scheme_id')
      .or(`class_id.eq.${exam.class_id},class_id.is.null`),
  ])
  const subjects = subjectsForClass(allSubjects ?? [], exam.class_id)

  const comboIds = (combos ?? []).map((c) => c.id)
  const { data: allMembers } = comboIds.length
    ? await supabase
        .from('exam_combination_members')
        .select('combination_id, exam_id, weight_percent')
        .in('combination_id', comboIds)
    : { data: [] as (ComboMember & { combination_id: string })[] }

  const membersByCombo = new Map<string, ComboMember[]>()
  for (const m of allMembers ?? []) {
    const list = membersByCombo.get(m.combination_id) ?? []
    list.push({ exam_id: m.exam_id, weight_percent: m.weight_percent })
    membersByCombo.set(m.combination_id, list)
  }
  // Only combinations that actually include this exam as a member make sense
  // as this page's result source.
  const eligibleCombos = (combos ?? []).filter((c) => (membersByCombo.get(c.id) ?? []).some((m) => m.exam_id === exam.id))
  const selectedCombo = sourceParam !== 'exam' ? eligibleCombos.find((c) => c.id === sourceParam) : undefined
  const effectiveSource = selectedCombo?.id ?? 'exam'

  let studentsQuery = supabase
    .from('students')
    .select('id, full_name, roll_number')
    .eq('class_name', cls?.name ?? '')
    .is('archived_at', null)
    .order('roll_number', { ascending: true, nullsFirst: false })
  studentsQuery = cls?.section ? studentsQuery.eq('section', cls.section) : studentsQuery.is('section', null)
  const { data: students } = await studentsQuery
  const roster = students ?? []

  const bodyWrap = (content: ReactNode) => (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      {header}
      <ResultControlsBar
        combinations={eligibleCombos.map((c) => ({ id: c.id, name: c.name }) satisfies CombinationOption)}
        source={effectiveSource}
        basis={basis}
        lang={lang}
      />
      {content}
    </main>
  )

  if (!subjects.length) return bodyWrap(<p className="text-sm text-muted">{t('markEntry.noSubjects', lang)}</p>)
  if (!roster.length) return bodyWrap(<p className="text-sm text-muted">{t('markEntry.noStudents', lang)}</p>)

  const { data: optionalRows } = await supabase
    .from('student_subjects')
    .select('student_id, subject_id, is_optional')
    .in(
      'subject_id',
      subjects.map((s) => s.id),
    )
  const optionalMap = new Map((optionalRows ?? []).map((o) => [`${o.student_id}:${o.subject_id}`, o.is_optional]))

  let scheme: GradingScheme | null = null
  const overallByStudent = new Map<string, OverallResult>()

  if (!selectedCombo) {
    scheme = exam.grading_scheme_id ? await loadGradingScheme(supabase, exam.grading_scheme_id) : null
    if (scheme) {
      const { data: marksRows } = await supabase
        .from('exam_marks')
        .select('student_id, subject_id, obtained_marks')
        .eq('exam_id', exam.id)
      const marksMap = new Map((marksRows ?? []).map((m) => [`${m.student_id}:${m.subject_id}`, Number(m.obtained_marks)]))
      for (const s of roster) {
        const marks: SubjectMark[] = subjects.map((sub) => ({
          subjectId: sub.id,
          fullMarks: subjectFullMarks(sub),
          obtainedMarks: marksMap.get(`${s.id}:${sub.id}`) ?? 0,
          isOptional: optionalMap.get(`${s.id}:${sub.id}`) ?? false,
        }))
        const results = marks.map((m) => evaluateSubject(m, scheme as GradingScheme))
        overallByStudent.set(s.id, evaluateOverallResult(results, scheme as GradingScheme))
      }
    }
  } else {
    scheme = selectedCombo.grading_scheme_id ? await loadGradingScheme(supabase, selectedCombo.grading_scheme_id) : null
    const members = membersByCombo.get(selectedCombo.id) ?? []
    const memberExamIds = members.map((m) => m.exam_id)

    if (scheme && memberExamIds.length) {
      const { data: marksRows } = await supabase
        .from('exam_marks')
        .select('exam_id, student_id, subject_id, obtained_marks')
        .in('exam_id', memberExamIds)
      const marksMap = new Map(
        (marksRows ?? []).map((m) => [`${m.exam_id}:${m.student_id}:${m.subject_id}`, Number(m.obtained_marks)]),
      )

      if (selectedCombo.strategy === 'sum') {
        for (const s of roster) {
          const examMarks: ExamSubjectMark[] = []
          for (const memberExamId of memberExamIds) {
            for (const sub of subjects) {
              examMarks.push({
                examId: memberExamId,
                subjectId: sub.id,
                fullMarks: subjectFullMarks(sub),
                obtainedMarks: marksMap.get(`${memberExamId}:${s.id}:${sub.id}`) ?? 0,
                isOptional: optionalMap.get(`${s.id}:${sub.id}`) ?? false,
              })
            }
          }
          const combined = combineBySum(examMarks)
          const results = combined.map((c) =>
            evaluateSubject(
              { subjectId: c.subjectId, fullMarks: c.fullMarks, obtainedMarks: c.obtainedMarks, isOptional: c.isOptional },
              scheme as GradingScheme,
            ),
          )
          overallByStudent.set(s.id, evaluateOverallResult(results, scheme as GradingScheme))
        }
      } else {
        let weights: Map<string, number> | null = null
        try {
          weights = resolveMemberWeights(members.map((m) => ({ examId: m.exam_id, weightPercent: m.weight_percent })))
        } catch {
          weights = null
        }
        if (weights) {
          for (const s of roster) {
            const percents: ExamPercent[] = memberExamIds.map((examId) => {
              let totalObtained = 0
              let totalFull = 0
              for (const sub of subjects) {
                totalObtained += marksMap.get(`${examId}:${s.id}:${sub.id}`) ?? 0
                totalFull += subjectFullMarks(sub)
              }
              return { examId, percent: subjectPercent(totalObtained, totalFull) }
            })
            const combinedPercent = combineByWeightedPercent(percents, weights)
            overallByStudent.set(s.id, evaluateCombinedPercent(combinedPercent, scheme as GradingScheme))
          }
        }
      }
    }
  }

  if (!scheme) return bodyWrap(<p className="text-sm text-muted">{t('promotion.noScheme', lang)}</p>)

  const rankable: RankableResult[] = roster.map((s) => {
    const overall = overallByStudent.get(s.id)
    return { studentId: s.id, passed: overall?.passed ?? false, gpa: overall?.gpa ?? null, percent: overall?.percent ?? 0 }
  })
  const rankedById = new Map(rankResults(rankable, basis).map((r) => [r.studentId, r]))

  const rows: PromotionStudentRow[] = roster.map((s) => {
    const overall = overallByStudent.get(s.id)
    const ranked = rankedById.get(s.id)
    return {
      id: s.id,
      roll_number: s.roll_number,
      full_name: s.full_name,
      passed: overall?.passed ?? false,
      label: overall?.label ?? null,
      position: ranked?.position ?? null,
    }
  })

  return bodyWrap(
    <>
      <FinalClassToggle
        examId={exam.id}
        classId={exam.class_id}
        isFinalClass={cls?.is_final_class ?? false}
        lang={lang}
      />
      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <PromotionTable
          examId={exam.id}
          rows={rows}
          classes={(allClasses ?? []) as ClassOption[]}
          currentClassName={cls?.name ?? null}
          lang={lang}
        />
      </section>
      {cls?.is_final_class && <GraduatingSection examId={exam.id} rows={rows} lang={lang} />}
    </>,
  )
}
