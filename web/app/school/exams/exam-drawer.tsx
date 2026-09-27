import { BookOpen, CalendarClock, ClipboardList, FileText, Layers } from 'lucide-react'
import { getSchoolContext } from '@/lib/school/context'
import { selectAllRows } from '@/lib/supabase/select-all'
import { examBasicInfoComplete } from '@/lib/exam-setup'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Pill } from '@/components/data-table/data-table'
import { DrawerFacts, DrawerSection, DrawerItemCard, type DrawerFact } from '@/components/data-table/drawer-parts'
import { ExamRowActions } from './exam-controls'
import { ExamDocumentsModal } from './exam-documents-modal'

// Exam record drawer body (drawer redesign). Deliberately placed one level
// above app/school/exams/ (not exams/exam-drawer.tsx): the fix agent's
// concurrent work spans exams/** broadly, so the new drawer-body file lives
// outside that glob — only exams/page.tsx gets a small call-site edit to wire
// it in. ExamDocumentsModal/ExamRowActions are imported (read-only) from
// exams/exam-controls.tsx, not modified.

type ExamFacts = {
  id: string
  name: string
  exam_year: number
  class_id: string | null
  start_date: string | null
  grading_scheme_id: string | null
  seat_plan_published_at: string | null
  results_published_at: string | null
  status: string
}

export type SubjectProgress = { id: string; name: string; entered: number; target: number }

/** Per-subject marks-entry progress for one exam — fetched only for the open
 *  `view` id, independent of exams/page.tsx's own activeItems/closed-items
 *  split (a closed exam's class may not be in that map). Marks are paged:
 *  roster × subjects passes PostgREST's 1,000-row cap on a big class. */
export async function loadExamDrawerData(examId: string, classId: string | null): Promise<{ subjects: SubjectProgress[] }> {
  if (!classId) return { subjects: [] }
  const { supabase } = await getSchoolContext()
  const [{ data: subjectRows }, { count: rosterCount }, { rows: markRows }] = await Promise.all([
    supabase.from('subjects').select('id, name').eq('class_id', classId).order('created_at'),
    supabase.from('student_enrollments').select('student_id', { count: 'exact', head: true }).eq('class_offering_id', classId).is('closed_at', null),
    selectAllRows<{ subject_id: string }>((from, to) =>
      supabase.from('exam_marks').select('subject_id').eq('exam_id', examId).order('id').range(from, to),
    ),
  ])
  const enteredBySubject = new Map<string, number>()
  for (const r of markRows ?? []) enteredBySubject.set(r.subject_id, (enteredBySubject.get(r.subject_id) ?? 0) + 1)
  const target = rosterCount ?? 0
  const subjects: SubjectProgress[] = (subjectRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    entered: enteredBySubject.get(s.id) ?? 0,
    target,
  }))
  return { subjects }
}

export function ExamDrawerBody({
  exam,
  classLabel,
  lastExamDate,
  subjects,
  origin,
  lang,
}: {
  exam: ExamFacts
  classLabel: string | null
  lastExamDate: string | null
  subjects: SubjectProgress[]
  origin: string
  lang: Lang
}) {
  const fmt = numberFmt(lang)
  const dash = <span className="text-muted">—</span>
  const complete = examBasicInfoComplete(exam)
  const totalEntered = subjects.reduce((s, x) => s + x.entered, 0)
  const totalTarget = subjects.reduce((s, x) => s + x.target, 0)

  const facts: DrawerFact[] = [
    { icon: <Layers className="size-3.5" aria-hidden />, label: t('exams.class', lang), value: classLabel ?? dash },
    { icon: <CalendarClock className="size-3.5" aria-hidden />, label: t('exams.startDate', lang), value: exam.start_date ?? dash },
    {
      icon: <ClipboardList className="size-3.5" aria-hidden />,
      label: t('examSetup.gradingScheme', lang),
      value: exam.grading_scheme_id ? t('exams.schemeSet', lang) : dash,
    },
  ]
  if (lastExamDate && lastExamDate !== exam.start_date) {
    facts.push({ icon: <CalendarClock className="size-3.5" aria-hidden />, label: t('exams.colPeriod', lang), value: lastExamDate })
  }

  return (
    <div className="space-y-1">
      <DrawerFacts facts={facts} />

      <DrawerSection
        title={t('exams.colProgress', lang)}
        count={subjects.length}
        defaultOpen={subjects.length > 0}
      >
        {subjects.length > 0 ? (
          <div className="space-y-2">
            {subjects.map((s) => {
              const pct = s.target > 0 ? Math.round((s.entered / s.target) * 100) : 0
              return (
                <DrawerItemCard
                  key={s.id}
                  icon={<BookOpen className="size-4" aria-hidden />}
                  title={s.name}
                  meta={[`${fmt.format(s.entered)} / ${fmt.format(s.target)}`]}
                  status={
                    <Pill tone={pct >= 100 ? 'mint' : pct > 0 ? 'sun' : 'muted'}>
                      {pct >= 100 ? t('exams.stageReady', lang) : `${fmt.format(pct)}%`}
                    </Pill>
                  }
                />
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('exams.subjectsMissingShort', lang)}</p>
        )}
        {totalTarget > 0 && (
          <p className="mt-2 text-xs text-muted">
            {t('exams.entriesDone', lang)}: {fmt.format(totalEntered)} / {fmt.format(totalTarget)}
          </p>
        )}
      </DrawerSection>

      {complete && (
        <DrawerSection title={t('examDocs.title', lang)} defaultOpen={false}>
          <DrawerItemCard
            icon={<FileText className="size-4" aria-hidden />}
            title={t('examDocs.title', lang)}
            meta={[]}
            status={<ExamDocumentsModal examId={exam.id} examLabel={`${exam.name} (${exam.exam_year})`} origin={origin} lang={lang} triggerClassName="text-xs font-semibold text-brand-600 hover:underline" />}
          />
        </DrawerSection>
      )}

      <DrawerSection title={t('exams.moreActionsSectionTitle', lang)} defaultOpen={false}>
        <ExamRowActions exam={exam} origin={origin} lang={lang} />
      </DrawerSection>
    </div>
  )
}

export function examDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
