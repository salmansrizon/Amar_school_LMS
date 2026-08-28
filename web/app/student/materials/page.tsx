import { currentLang } from '@/lib/i18n-server'
import { t, type MessageKey } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupMaterials, fileKind, isDownloadable, type StudentMaterial } from '@/lib/student/materials'
import { pageTitle } from '@/lib/student/metadata'

// The kinds we have labels for. An unexpected kind still renders — groupMaterials
// keeps it — so it falls back to its own name rather than throwing in t().
const KIND_LABELS: Record<string, MessageKey> = {
  syllabus: 'material.syllabus',
  lesson_plan: 'material.lesson_plan',
  daily_lesson: 'material.daily_lesson',
  exam_prep: 'material.exam_prep',
}

// Study material (#447): the class syllabus and the posted lesson plans, on one
// surface. `student_material` (0141) unions both and has already decided what
// this Student may see, so there is no filtering here.
export const generateMetadata = pageTitle('student.materialsTitle')

export default async function StudentMaterialsPage() {
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase
    .from('student_material')
    .select('id, source, kind, title, content, storage_path, file_name, link_url, posted_at, posted_by')
    .order('posted_at', { ascending: false })

  const groups = groupMaterials((data ?? []) as StudentMaterial[])
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-extrabold">{t('student.materialsTitle', lang)}</h1>

      {!groups.length ? (
        <p className="rounded-lg border border-line bg-paper p-6 text-sm text-muted">
          {t('student.noMaterials', lang)}
          <span className="mt-1 block text-xs">{t('student.noMaterialsHint', lang)}</span>
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.key} className="rounded-lg border border-line bg-paper p-5">
              <h2 className="mb-3 text-sm font-bold">
                {KIND_LABELS[group.key] ? t(KIND_LABELS[group.key], lang) : group.key}
              </h2>
              <ul className="divide-y divide-line">
                {group.items.map((item) => (
                  <li key={`${item.source}-${item.id}`} className="flex items-start justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block text-xs text-muted">
                        {[
                          fileKind(item),
                          new Date(item.posted_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          }),
                          item.posted_by ? `${t('student.postedBy', lang)} ${item.posted_by}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {item.content && (
                        <span className="mt-1 block whitespace-pre-wrap text-xs">{item.content}</span>
                      )}
                    </span>

                    {isDownloadable(item) ? (
                      <a
                        href={`/api/student/material?source=${item.source}&id=${item.id}`}
                        className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                      >
                        {t('student.download', lang)}
                      </a>
                    ) : item.link_url ? (
                      <a
                        href={item.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
                      >
                        {t('student.openLink', lang)}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
