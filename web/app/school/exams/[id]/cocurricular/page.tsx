import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { sortCocurricularItems } from '@/lib/cocurricular'
import { CocurricularEntryTable, type ChecklistStudentRow } from './controls'

// Per-exam entry grid for the co-curricular checklist (issue #33, migration
// 0052) — roster x school-defined items, mirrors marks-entry's per-exam
// roster-driven layout (one Save covers every row).

export default async function CocurricularEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    .select('id, name, exam_year, status, class_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const closed = exam.status === 'closed'
  const examLabel = `${exam.name} (${exam.exam_year})`

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">
        {t('cocurricular.entryTitle', lang)} — {examLabel}
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
          {t('markEntry.noClassSet', lang)}
        </p>
      </main>
    )
  }

  const { data: cls } = await supabase.from('classes').select('name, section').eq('id', exam.class_id).maybeSingle()
  const { data: items } = await supabase.from('cocurricular_items').select('id, label, sort_order')
  const sortedItems = sortCocurricularItems(items ?? [])

  if (!sortedItems.length) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('cocurricular.noItemsHint', lang)}{' '}
          <Link href="/school/exams/cocurricular-items" className="text-brand-600 hover:underline">
            {t('cocurricular.itemsTitle', lang)}
          </Link>
        </p>
      </main>
    )
  }

  let studentsQuery = supabase
    .from('students')
    .select('id, full_name, roll_number')
    .eq('class_name', cls?.name ?? '')
    .is('archived_at', null)
    .order('roll_number', { ascending: true, nullsFirst: false })
  studentsQuery = cls?.section ? studentsQuery.eq('section', cls.section) : studentsQuery.is('section', null)

  const [{ data: students }, { data: markRows }] = await Promise.all([
    studentsQuery,
    supabase.from('cocurricular_checklist_marks').select('student_id, item_id, checked').eq('exam_id', id),
  ])

  if (!students?.length) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-6">
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted shadow-card">
          {t('markEntry.noStudents', lang)}
        </p>
      </main>
    )
  }

  const checkedByStudent = new Map<string, Set<string>>()
  for (const m of markRows ?? []) {
    if (!m.checked) continue
    const set = checkedByStudent.get(m.student_id) ?? new Set<string>()
    set.add(m.item_id)
    checkedByStudent.set(m.student_id, set)
  }

  const rows: ChecklistStudentRow[] = students.map((s) => ({
    id: s.id,
    roll_number: s.roll_number,
    full_name: s.full_name,
    checkedItemIds: [...(checkedByStudent.get(s.id) ?? new Set<string>())],
  }))

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      {header}
      {closed && <p className="mb-3 text-xs text-alert-deep">{t('markEntry.closedNote', lang)}</p>}
      <section className="rounded-lg border border-line bg-paper p-4 shadow-card">
        <CocurricularEntryTable examId={exam.id} items={sortedItems} rows={rows} disabled={closed} lang={lang} />
      </section>
    </main>
  )
}
