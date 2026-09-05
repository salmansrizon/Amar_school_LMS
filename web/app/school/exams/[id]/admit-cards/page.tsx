import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { BackLink } from '@/components/back-link'
import { resolveBackHref, selfOrigin, withOrigin } from '@/lib/back-nav'

// Admit card roster picker (issue #48, PRD §5.5) — same shape as printables/
// page.tsx's mark-sheet/progress-report roster, one entry point per student
// plus a link into the shared batch print-all page (../print-all) preset to
// the admit-card doc type.

export default async function AdmitCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string | string[] }>
}) {
  const { id } = await params
  const { from } = await searchParams
  const backHref = resolveBackHref(from, `/school/exams/${id}`)
  // Links from here go a level deeper, so they carry *this* page's
  // address — origin included — otherwise Back from the leaf lands here
  // and the next Back falls through to Basic Info (map #373).
  const deeper = selfOrigin(`/school/exams/${id}/admit-cards`, from)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, exam_year, class_id')
    .eq('id', id)
    .maybeSingle()
  if (!exam) notFound()
  const examLabel = `${exam.name} (${exam.exam_year})`

  const header = (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-2xl font-extrabold">
        {t('admitCard.title', lang)} — {examLabel}
      </h1>
      <div className="flex items-center gap-4">
        <Link
          href={withOrigin(`/school/exams/${exam.id}/print-all?doc=admit-card`, deeper)}
          className="text-sm text-brand-600 hover:underline"
        >
          {t('printAll.title', lang)}
        </Link>
        <BackLink href={backHref} label={t('common.back', lang)} />
      </div>
    </div>
  )

  if (!exam.class_id) {
    return (
      <div>
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">
          {t('markEntry.noClassSet', lang)}
        </p>
      </div>
    )
  }

  const { data: cls } = await supabase.from('class_offerings').select('name, section').eq('id', exam.class_id).maybeSingle()
  let studentsQuery = supabase
    .from('students')
    .select('id, full_name, roll_number')
    .eq('class_name', cls?.name ?? '')
    .is('archived_at', null)
    .order('roll_number', { ascending: true, nullsFirst: false })
  studentsQuery = cls?.section ? studentsQuery.eq('section', cls.section) : studentsQuery.is('section', null)
  const { data: students } = await studentsQuery

  if (!students?.length) {
    return (
      <div>
        {header}
        <p className="rounded-lg border border-line bg-paper p-5 text-sm text-muted">
          {t('markEntry.noStudents', lang)}
        </p>
      </div>
    )
  }

  return (
    <div>
      {header}
      <section className="rounded-lg border border-line bg-paper p-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-2 font-semibold">{t('students.roll', lang)}</th>
              <th className="py-2 pr-2 font-semibold">{t('students.name', lang)}</th>
              <th className="py-2 font-semibold">{t('admitCard.docWord', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b border-line">
                <td className="py-2 pr-2">{s.roll_number ?? '—'}</td>
                <td className="py-2 pr-2">{s.full_name}</td>
                <td className="py-2">
                  <Link href={withOrigin(`/school/exams/${exam.id}/admit-cards/${s.id}`, deeper)} className="text-brand-600 hover:underline">
                    {t('admitCard.docWord', lang)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
