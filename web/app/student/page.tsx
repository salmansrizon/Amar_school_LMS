import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'

// Student home (#441). The identity card only — upcoming classes, notices,
// results and fees each arrive with their own ticket on map #434.
export default async function StudentHome() {
  const lang = await currentLang()
  const { student } = await getStudentContext()

  const facts = [
    { label: t('student.home.studentNo', lang), value: student.student_no ?? '—' },
    {
      label: t('student.home.class', lang),
      value: [student.class_name, student.section].filter(Boolean).join(' - ') || '—',
    },
    { label: t('student.home.roll', lang), value: student.roll_number ?? '—' },
  ]

  return (
    <main className="w-full p-6">
      <h1 className="mb-1 text-2xl font-extrabold">
        {t('student.home.greeting', lang)}, {student.full_name}
      </h1>
      <p className="mb-4 text-sm text-muted">{t('home.student', lang)}</p>

      <section className="mb-6 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-lg border border-line bg-paper p-4">
            <div className="text-xl font-extrabold text-brand-700">{f.value}</div>
            <div className="text-xs text-muted">{f.label}</div>
          </div>
        ))}
      </section>

      <p className="max-w-2xl text-sm text-muted">{t('student.home.soon', lang)}</p>
    </main>
  )
}
