import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolRoster } from '@/lib/school/roster-source'
import { behaviourAverages } from '@/lib/students'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import type { RosterStudent } from '@/lib/school/roster'
import { PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { EntityAvatar } from '@/components/entity-avatar'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { getStudent, StudentProfile } from './[id]/student-profile'

// Layout per ui/school-owner/students-list.html: search (name/roll/guardian) +
// class/section filters, table Roll | Name | Class | Guardian |
// Behaviour Avg | Status | View, with Old Students + New Admission actions.
// The Class column renders the full shared Class Catalogue label (issue
// #621's follow-up), not a bare class_name/section join — same format every
// picker in the app already uses.
//
// List archetype (gate #372): renders bare content — the shell owns the <main>,
// the width and the gutters — so the table fills the viewport instead of sitting
// in an 896px column. Columns distribute across that width the way an ERP grid
// does; an earlier pass clustered them left and left the right half of the card
// empty, which read as broken rather than tidy.
/** The Class column's full Class Catalogue label ({name} ({group}) - {shift}
 *  - {section} — {year}), same shared formatter every other picker/label in
 *  the app uses — never a bare class_name/section join. Null for an unplaced
 *  Student (class_name null), same as before this column carried more than
 *  name+section. */
function classLabelFor(s: RosterStudent, showYear: boolean): string | null {
  if (!s.class_name) return null
  return classCatalogueLabel(
    { name: s.class_name, section: s.section, group_department: s.group_department, shift: s.shift, academic_year: s.academic_year },
    showYear,
  )
}

function avgBadge(avg: number | undefined) {
  if (avg === undefined) return <span className="text-muted">—</span>
  return <Pill tone={avg >= 4 ? 'mint' : avg >= 3 ? 'sun' : 'alert'}>{avg}</Pill>
}

const PAGE_SIZE = 20

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classSection?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', classSection = '', page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { supabase, role, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1

  const [roster, { data: ratings }, viewed] = await Promise.all([
    schoolRoster(supabase, { classSection, q, shiftSelection, showYear, academicYearSelection }),
    // ponytail: whole-table scan capped at 10k rows, mirrors the classes page.
    supabase.from('behaviour_log_entries').select('student_id, rating').limit(10000),
    view ? getStudent(view) : Promise.resolve(null),
  ])
  const avgs = behaviourAverages(ratings ?? [])
  const pageData = paginate(roster.students, page, pageSize)

  const columns: Column<RosterStudent>[] = [
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
      header: t('students.classSection', lang),
      cell: (s) => classLabelFor(s, showYear) ?? <span className="text-muted">—</span>,
    },
    {
      key: 'guardian',
      header: t('students.guardian', lang),
      cell: (s) => s.guardian_name ?? <span className="text-muted">—</span>,
    },
    { key: 'behaviour', header: t('students.behaviourAvg', lang), cell: (s) => avgBadge(avgs.get(s.id)) },
    {
      key: 'status',
      header: t('students.status', lang),
      card: 'badge',
      cell: () => <Pill tone="mint">{t('students.active', lang)}</Pill>,
    },
  ]

  // #538: an empty list says which kind of empty it is and offers the one
  // action that changes it (lib/school/roster.ts decides which).
  const empty =
    roster.empty === 'unassigned' ? (
      <EmptyState
        title={t('students.noClassAssigned', lang)}
        body={t('students.noClassAssignedHelp', lang)}
        action={{ href: '/school', label: t('denied.back', lang) }}
        lang={lang}
      />
    ) : roster.empty === 'no-match' ? (
      <EmptyState
        title={t('students.noMatch', lang)}
        body={t('students.noMatchHelp', lang)}
        action={{ href: '/school/students', label: t('students.clearFilters', lang) }}
        lang={lang}
      />
    ) : (
      <EmptyState
        title={t('students.none', lang)}
        action={{ href: '/school/students/new', label: t('students.newAdmission', lang) }}
        lang={lang}
      />
    )

  const secondary =
    'inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted'

  return (
    <>
      <PageHeader
        title={t('students.listTitle', lang)}
        actions={
          <>
            <Link href="/school/students/archive" className={secondary}>
              {t('students.oldStudents', lang)}
            </Link>
            {/* Issuing logins is owner-only (#442) — the screen redirects Staff. */}
            {role === 'school_owner' && (
              <Link href="/school/students/logins" className={secondary}>
                {t('students.loginBulk', lang)}
              </Link>
            )}
            <Link
              href="/school/students/new"
              className="inline-flex h-11 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + {t('students.newAdmission', lang)}
            </Link>
          </>
        }
      />

      <DataTable
        rows={pageData.items}
        rowId={(s) => s.id}
        rowLabel={(s) => s.full_name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('students.listTitle', lang)}
        search={{ placeholder: t('students.search', lang) }}
        filters={[{ param: 'classSection', label: t('students.classSection', lang), options: roster.combos }]}
        rowActions={(s) => (
          <ViewLink id={s.id} params={params} label={t('table.profile', lang)} name={s.full_name} />
        )}
        rowMenu={(s) => [
          { label: t('students.view', lang), href: `/school/students/${s.id}` },
          { label: t('students.transfer', lang), href: `/school/students/${s.id}/transfer` },
        ]}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={empty}
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
