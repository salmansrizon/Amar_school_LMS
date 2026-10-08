import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { navGroupFor } from '@/lib/school-nav'
import { matchesStudentQuery, type StudentListRow } from '@/lib/students'
import { selectAllRows } from '@/lib/supabase/select-all'
import { PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { EntityAvatar } from '@/components/entity-avatar'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { getStudent, StudentProfile } from '../[id]/student-profile'
import { RestoreButton } from './restore-button'
import { pageTitle } from '@/lib/page-title'

// Old students (soft-archived) — DataTable + the same record drawer the active
// directory uses (map 013, S1). Search and Restore are the only existing
// features; class/fee filters live on the active list, not here. Rows stay for
// history/reports — restore just clears archived_at, same RPC as before.

const PAGE_SIZE = 20

export const generateMetadata = pageTitle('students.archiveTitle')

export default async function StudentsArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ rows: students }, viewed] = await Promise.all([
    selectAllRows((from, to) =>
      supabase
        .from('students')
        .select('id, full_name, roll_number, class_name, section, guardian_name, archived_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
        .range(from, to),
    ),
    view ? getStudent(view) : Promise.resolve(null),
  ])

  const visible = students.filter((s) => matchesStudentQuery(s, q))
  const pageData = paginate(visible, page, pageSize)
  const fmt = numberFmt(lang)
  const dateFmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  })
  const group = navGroupFor('/school/students/archive')?.group
  const dash = <span className="text-muted">—</span>

  const columns: Column<StudentListRow>[] = [
    {
      key: 'name',
      header: t('students.name', lang),
      card: 'title',
      cell: (s) => (
        <div className="flex items-center gap-3">
          <EntityAvatar name={s.full_name} id={s.id} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{s.full_name}</div>
            <div className="text-xs text-muted">
              {t('students.roll', lang)} {s.roll_number ?? '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'class',
      header: t('students.lastClassSection', lang),
      cell: (s) => [s.class_name, s.section].filter(Boolean).join(' / ') || dash,
    },
    {
      key: 'guardian',
      header: t('students.guardian', lang),
      cell: (s) => s.guardian_name ?? dash,
    },
    {
      key: 'archivedOn',
      header: t('students.archivedOn', lang),
      cell: (s) => (s.archived_at ? dateFmt.format(new Date(s.archived_at)) : dash),
    },
    {
      key: 'status',
      header: t('students.status', lang),
      card: 'badge',
      cell: () => <Pill tone="muted">{t('students.oldStudent', lang)}</Pill>,
    },
  ]

  return (
    <>
      <PageHeader
        title={t('students.archiveTitle', lang)}
        crumbs={{
          lang,
          items: [
            { label: t('dash.dashboard', lang), href: '/school' },
            ...(group ? [{ label: t(group.labelKey, lang) }] : []),
            { label: t('students.listTitle', lang), href: '/school/students' },
            { label: t('students.archiveTitle', lang) },
          ],
        }}
        badge={`${t('pager.total', lang)}: ${fmt.format(students.length)}`}
      />

      <DataTable
        rows={pageData.items}
        rowId={(s) => s.id}
        rowLabel={(s) => s.full_name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('students.archiveTitle', lang)}
        search={{ placeholder: t('students.archiveSearch', lang) }}
        rowActions={(s) => (
          <>
            <ViewLink id={s.id} params={params} label={t('table.profile', lang)} name={s.full_name} />
            <RestoreButton lang={lang} studentId={s.id} />
          </>
        )}
        rowMenu={(s) => [{ label: t('table.openFullPage', lang), href: `/school/students/${s.id}` }]}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          students.length ? (
            <EmptyState
              icon="students"
              title={t('students.noMatch', lang)}
              action={{ href: '/school/students/archive', label: t('students.clearFilters', lang) }}
              lang={lang}
            />
          ) : (
            <EmptyState
              icon="students"
              title={t('students.noArchived', lang)}
              action={{ href: '/school/students', label: t('students.activeList', lang) }}
              lang={lang}
            />
          )
        }
      />

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.full_name ?? ''}
        subtitle={viewed?.roll_number != null ? `${t('students.roll', lang)} ${viewed.roll_number}` : undefined}
        fullPageHref={viewed ? `/school/students/${viewed.id}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed && <StudentProfile id={viewed.id} lang={lang} />}
      </RecordDrawer>
    </>
  )
}
