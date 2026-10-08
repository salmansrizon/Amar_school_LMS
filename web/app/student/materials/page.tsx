import { currentLang } from '@/lib/i18n-server'
import { t, formatDate, formatNumber, type MessageKey } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { groupMaterials, fileKind, isDownloadable, type StudentMaterial } from '@/lib/student/materials'
import { matchesQ, pageOf } from '@/lib/student/table'
import { pageTitle } from '@/lib/page-title'
import { studentGroupTabs } from '@/lib/student-nav'
import { PageHeader } from '@/components/ui/page'
import { SectionTabs } from '@/components/ui/section-tabs'
import { EmptyState } from '@/components/ui/states'
import { DataTable, type Column } from '@/components/data-table/data-table'
import { NoMatch } from '@/components/student/no-match'
import { markdownToPlainText } from '@/lib/rich-text'

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
// this Student may see, so there is no filtering here beyond the search and
// kind filter the table adds. Neither source records a subject, so there is no
// subject column or filter (see lib/student/materials.ts).
export const generateMetadata = pageTitle('student.materialsTitle')

export default async function StudentMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const lang = await currentLang()
  const { supabase } = await getStudentContext()

  const { data } = await supabase
    .from('student_material')
    .select('id, source, kind, title, content, storage_path, file_name, link_url, posted_at, posted_by')
    .order('posted_at', { ascending: false })

  // Syllabus first, then each kind, newest first inside it (groupMaterials).
  const groups = groupMaterials((data ?? []) as StudentMaterial[])
  const items = groups.flatMap((g) => g.items)
  const shown = items.filter((m) => matchesQ(params.q, m.title) && (!params.kind || m.kind === params.kind))
  const paged = pageOf(shown, params)
  const kindLabel = (kind: string) => (KIND_LABELS[kind] ? t(KIND_LABELS[kind], lang) : kind)
  const linkClass =
    'inline-flex min-h-11 shrink-0 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted sm:min-h-9 sm:px-3'

  const columns: Column<StudentMaterial>[] = [
    {
      key: 'title',
      header: t('student.col.title', lang),
      card: 'title',
      className: 'max-w-md',
      cell: (m) => (
        <>
          <span className="font-semibold">{m.title}</span>
          {m.content && <div className="line-clamp-2 text-xs text-muted">{markdownToPlainText(m.content)}</div>}
        </>
      ),
    },
    {
      key: 'kind',
      header: t('student.col.type', lang),
      card: 'badge',
      cell: (m) => [kindLabel(m.kind), fileKind(m)].filter(Boolean).join(' · '),
    },
    {
      key: 'date',
      header: t('student.col.date', lang),
      cell: (m) => (
        <>
          {formatDate(m.posted_at, lang)}
          {m.posted_by && (
            <div className="text-xs text-muted">
              {t('student.postedBy', lang)} {m.posted_by}
            </div>
          )}
        </>
      ),
    },
  ]

  const kinds = [...new Set(items.map((m) => m.kind))]

  return (
    <main className="w-full px-gutter pt-section pb-16 ui-rows">
      <PageHeader
        icon="materials"
        title={t('student.materialsTitle', lang)}
        crumbs={{ lang, items: [{ label: t('student.nav.home', lang), href: '/student' }, { label: t('student.navGroup.study', lang) }] }}
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
          icon="materials"
          lang={lang}
          title={t('student.noMaterials', lang)}
          body={t('student.noMaterialsHint', lang)}
          action={{ href: '/student/tasks', label: t('student.nav.tasks', lang) }}
        />
      ) : (
        <DataTable
          rows={paged.items}
          rowId={(m) => `${m.source}-${m.id}`}
          rowLabel={(m) => m.title}
          columns={columns}
          lang={lang}
          params={params}
          caption={t('student.materialsTitle', lang)}
          search={{ placeholder: t('student.col.search', lang) }}
          filters={[
            {
              param: 'kind',
              label: t('student.col.type', lang),
              options: kinds.map((k) => ({ value: k, label: kindLabel(k) })),
            },
          ]}
          rowActions={(m) =>
            isDownloadable(m) ? (
              <a href={`/api/student/material?source=${m.source}&id=${m.id}`} className={linkClass}>
                {t('student.download', lang)}
              </a>
            ) : m.link_url ? (
              <a href={m.link_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {t('student.openLink', lang)}
              </a>
            ) : null
          }
          pagination={{ page: paged.page, totalPages: paged.totalPages, total: paged.total, pageSize: paged.pageSize }}
          empty={<NoMatch lang={lang} />}
        />
      )}
    </main>
  )
}
