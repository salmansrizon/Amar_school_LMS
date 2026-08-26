import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { Card, PageHeader } from '@/components/ui/page'

// Who has ticked this task off (#446), for the Class Teacher.
//
// The wording matters and is repeated deliberately: a tick is the Student's own
// claim about their own work, not evidence of it. Real submission is #448, and
// conflating the two would let a teacher mark attendance-of-effort as proof.
export default async function TaskRosterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data: task } = await supabase
    .from('publications')
    .select('id, title, due_at, target_class_name, target_section')
    .eq('id', id)
    .eq('kind', 'homework')
    .maybeSingle()
  if (!task) notFound()

  const { data: roster } = await supabase
    .from('task_completion_roster')
    .select('student_id, full_name, roll_number, completed_at')
    .eq('publication_id', id)
    .order('roll_number', { ascending: true, nullsFirst: false })

  const rows = roster ?? []
  const done = rows.filter((r) => r.completed_at)
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <>
      <PageHeader
        title={task.title}
        backHref="/school/my-classes"
        backLabel={t('myClasses.title', lang)}
      />
      <Card>
        <p className="mb-1 text-sm">
          <strong>{done.length}</strong> / {rows.length} {t('student.taskDone', lang)}
          {task.due_at && (
            <span className="ml-2 text-xs text-muted">
              {t('student.taskDue', lang)}:{' '}
              {new Date(task.due_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </span>
          )}
        </p>
        <p className="mb-4 text-xs text-muted">{t('tasks.claimNotProof', lang)}</p>

        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.student_id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {r.roll_number !== null && (
                  <span className="mr-2 text-xs text-muted">#{r.roll_number}</span>
                )}
                {r.full_name}
              </span>
              {r.completed_at ? (
                <span className="rounded-full bg-mint-soft px-2 py-0.5 text-xs font-semibold text-mint-deep">
                  ✓ {new Date(r.completed_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                </span>
              ) : (
                <span className="text-xs text-muted">—</span>
              )}
            </li>
          ))}
          {!rows.length && <li className="py-2 text-sm text-muted">{t('student.noTasks', lang)}</li>}
        </ul>
      </Card>
    </>
  )
}
