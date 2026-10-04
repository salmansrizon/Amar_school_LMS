import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type MessageKey } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupMaterials, fileKind, isDownloadable, type StudentMaterial } from '@/lib/student/materials'
import { pageTitle } from '@/lib/page-title'
import { studentGroupTabs } from '@/lib/student-nav'
import { Card, PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'

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
  const linkClass =
    'inline-flex min-h-11 shrink-0 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted sm:min-h-9 sm:px-3'

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={t('student.materialsTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.materialsTitle', lang) }] }}
        badge={data?.length ? formatNumber(data.length, lang) : undefined}
      />
      <SectionTabs
        tabs={studentGroupTabs('study')}
        active="/student/materials"
        lang={lang}
        label={t('student.navGroup.study', lang)}
      />

      {!groups.length ? (
        <EmptyState
          lang={lang}
          title={t('student.noMaterials', lang)}
          body={t('student.noMaterialsHint', lang)}
          action={{ href: '/student/tasks', label: t('student.nav.tasks', lang) }}
        />
      ) : (
        <div className="grid gap-grid lg:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.key} tone="brand" className="self-start">
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
                          formatDate(item.posted_at, lang),
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
                      <a href={`/api/student/material?source=${item.source}&id=${item.id}`} className={linkClass}>
                        {t('student.download', lang)}
                      </a>
                    ) : item.link_url ? (
                      <a href={item.link_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {t('student.openLink', lang)}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
