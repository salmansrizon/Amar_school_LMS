import { BookOpen, CalendarClock, Layers, Users } from 'lucide-react'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { ACADEMIC_SHIFT_LABEL_KEY, isKnownAcademicShift, type AcademicShift } from '@/lib/institute'
import { withParams, type Params } from '@/lib/url-params'
import { Pill } from '@/components/data-table/data-table'
import { DrawerFacts, DrawerSection, DrawerItemCard, type DrawerFact } from '@/components/data-table/drawer-parts'
import { ClassTeacherPicker } from './class-teacher-picker'
import { ArchiveOrDeleteButton } from './class-controls'
import Link from 'next/link'

// Class record drawer body (drawer redesign): section/level/group/shift/year
// facts, live Class Teacher assignment (unchanged control), a Subjects
// section (real subjects already loaded for the Subjects tab, filtered to
// this class — no extra query) and a Routine-coverage fact. Routine/
// Syllabus/Subjects quick links and Archive-or-Delete (all pre-existing
// actions) stay reachable in a collapsed "More actions" section.

export type ClassDrawerRow = {
  id: string
  name: string
  section: string | null
  education_level: string | null
  group_department: string | null
  class_teacher_id: string | null
  shift: string | null
  academic_year: number | null
}

export type ClassDrawerSubject = {
  id: string
  name: string
  code: string | null
  theory_marks: number
  mcq_marks: number
  practical_marks: number
  paper_count: number
}

const linkPill =
  'inline-flex h-9 items-center rounded-full border border-line-strong px-3 text-xs font-semibold hover:bg-paper-muted'

export function ClassDrawerBody({
  cls,
  studentCount,
  hasRoutine,
  subjects,
  teachers,
  usedIds,
  showYear,
  lang,
}: {
  cls: ClassDrawerRow
  studentCount: number
  hasRoutine: boolean
  subjects: ClassDrawerSubject[]
  teachers: { id: string; full_name: string }[]
  usedIds: Set<string>
  showYear: boolean
  lang: Lang
}) {
  const fmt = numberFmt(lang)
  const dash = <span className="text-muted">—</span>
  const shiftLabel = (s: string | null) => (s ? t(ACADEMIC_SHIFT_LABEL_KEY[s as AcademicShift], lang) : null)

  const facts: DrawerFact[] = [
    { icon: <Layers className="size-3.5" aria-hidden />, label: t('classes.section', lang), value: cls.section ?? dash },
    { icon: <Layers className="size-3.5" aria-hidden />, label: t('classes.educationLevel', lang), value: cls.education_level ?? dash },
    { icon: <Layers className="size-3.5" aria-hidden />, label: t('classes.groupDept', lang), value: cls.group_department ?? dash },
    ...(isKnownAcademicShift(cls.shift ?? '') ? [{ icon: <Layers className="size-3.5" aria-hidden />, label: t('classes.shift', lang), value: shiftLabel(cls.shift) ?? dash }] : []),
    ...(showYear ? [{ icon: <CalendarClock className="size-3.5" aria-hidden />, label: t('classes.academicYear', lang), value: cls.academic_year ?? dash }] : []),
    { icon: <Users className="size-3.5" aria-hidden />, label: t('classes.students', lang), value: fmt.format(studentCount) },
    {
      icon: <CalendarClock className="size-3.5" aria-hidden />,
      label: t('classes.routine', lang),
      value: <Pill tone={hasRoutine ? 'mint' : 'muted'}>{t(hasRoutine ? 'classes.routineSet' : 'classes.routineNotSet', lang)}</Pill>,
    },
  ]

  return (
    <div className="space-y-1">
      <DrawerFacts facts={facts} />

      <div className="border-t border-line py-3">
        <p className="mb-1 text-xs text-muted">{t('classes.classTeacher', lang)}</p>
        <ClassTeacherPicker key={cls.id} lang={lang} classId={cls.id} teachers={teachers} current={cls.class_teacher_id} />
      </div>

      <DrawerSection title={t('classes.tabSubjects', lang)} count={subjects.length} defaultOpen={subjects.length > 0}>
        {subjects.length > 0 ? (
          <div className="space-y-2">
            {subjects.map((s) => (
              <DrawerItemCard
                key={s.id}
                icon={<BookOpen className="size-4" aria-hidden />}
                title={s.code ? `${s.name} (${s.code})` : s.name}
                meta={[s.paper_count > 1 ? `${s.paper_count} ${t('classes.papersWord', lang)}` : t('classes.singlePaper', lang)]}
                href={`/school/classes?tab=subjects&view=${s.id}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('classes.noSubjects', lang)}</p>
        )}
      </DrawerSection>

      <DrawerSection title={t('classes.moreActionsSectionTitle', lang)} defaultOpen={false}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/school/classes/routine?class=${cls.id}`} className={linkPill}>
            {t('classes.routine', lang)}
          </Link>
          <Link href="/school/classes/syllabus" className={linkPill}>
            {t('classes.syllabus', lang)}
          </Link>
          <Link href={`/school/students/subject-assignment?class=${cls.id}`} className={linkPill}>
            {t('classes.subjects', lang)}
          </Link>
          <span className="ml-auto">
            <ArchiveOrDeleteButton classOfferingId={cls.id} used={usedIds.has(cls.id)} lang={lang} />
          </span>
        </div>
      </DrawerSection>
    </div>
  )
}

export function classDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
