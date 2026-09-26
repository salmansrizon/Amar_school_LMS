import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { numberFmt } from '@/lib/i18n'
import { loadDirectoryRows } from './directory-rows'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import type { RosterStudent } from '@/lib/school/roster'
import { PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { EntityAvatar } from '@/components/entity-avatar'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { RowMenu } from '@/components/data-table/row-menu'
import { PrintTrigger } from '@/components/print/print-trigger'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { withParams } from '@/lib/url-params'
import { IdCard, UserPlus, Users, Wallet } from 'lucide-react'
import { getStudent, StudentProfile } from './[id]/student-profile'

// Layout per Design System/new_ui/02-people/student-directory (map 013, P1):
// stat cards, search (name / roll / Student Number / guardian / mobile), class
// filter, Monthly Fee Standing filter + chips, DataTable with a record drawer.
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

const FEE_TONE = { paid: 'mint', partial: 'sun', due: 'alert' } as const
const FEE_LABEL = { paid: 'students.feePaid', partial: 'students.feePartial', due: 'students.feeDue' } as const

const PAGE_SIZE = 20

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classSection?: string; fee?: string; admitted?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', classSection = '', fee, admitted, page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { role } = await getSchoolContext()
  const [{ roster, fees, rows, showYear, admittedThisMonth }, viewed] = await Promise.all([
    loadDirectoryRows({ q, classSection, fee, admitted }),
    view ? getStudent(view) : Promise.resolve(null),
  ])
  const pageData = paginate(rows, page, pageSize)
  const fmt = numberFmt(lang)
  const withDues = roster.readable.filter((s) => {
    const st = fees.get(s.id)?.standing
    return st === 'due' || st === 'partial'
  }).length
  const newThisMonth = roster.readable.filter(admittedThisMonth).length

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
              {s.student_no ? ` · ${s.student_no}` : ''}
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
      header: t('students.contact', lang),
      cell: (s) =>
        s.guardian_name || s.guardian_mobile ? (
          <div className="min-w-0">
            <div className="truncate">{s.guardian_name ?? '—'}</div>
            {s.guardian_mobile && <div className="font-mono text-xs text-muted">{s.guardian_mobile}</div>}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'fee',
      header: t('students.feeStanding', lang),
      card: 'badge',
      cell: (s) => {
        const f = fees.get(s.id)
        if (!f) return <Pill tone="muted">{t('students.feeNotBilled', lang)}</Pill>
        return (
          <Pill tone={FEE_TONE[f.standing]}>
            {t(FEE_LABEL[f.standing], lang)}
            {f.standing !== 'paid' && ` ৳${fmt.format(f.due)}`}
          </Pill>
        )
      },
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
    ) : roster.empty === 'no-match' || roster.students.length > 0 ? (
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
        crumbs={{
          lang,
          items: [{ label: t('dash.dashboard', lang), href: '/school' }, { label: t('students.listTitle', lang) }],
        }}
        badge={`${t('students.totalBadge', lang)}: ${fmt.format(roster.readable.length)}`}
        actions={
          <>
            <Link href="/school/students/archive" className={secondary}>
              {t('students.oldStudents', lang)}
            </Link>
            <PrintTrigger
              href={`/school/students/print/id-cards${withParams(params, { view: null, page: null, size: null })}`}
              label={t('students.idCardBulk', lang)}
              icon={<IdCard className="size-4" aria-hidden />}
            />
            <a href={`/school/students/export${withParams(params, { view: null, page: null, size: null })}`} className={secondary} download>
              {t('students.exportCsv', lang)}
            </a>
            <Link
              href="/school/students/new"
              className="inline-flex h-11 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + {t('students.newAdmission', lang)}
            </Link>
            {/* Issuing logins is owner-only (#442) — the screen redirects Staff. */}
            {role === 'school_owner' && (
              <RowMenu
                label={t('students.more', lang)}
                items={[{ label: t('students.loginBulk', lang), href: '/school/students/logins' }]}
              />
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard
          icon={<Users className="size-5" />}
          tone="mint"
          label={t('students.statTotal', lang)}
          value={fmt.format(roster.readable.length)}
        />
        <StatCard
          icon={<Wallet className="size-5" />}
          tone="alert"
          label={t('students.statFeeDue', lang)}
          value={fmt.format(withDues)}
          note={t('students.statFeeDueNote', lang)}
          action={{ href: withParams({}, { fee: 'due' }), label: t('students.statView', lang) }}
        />
        <StatCard
          icon={<UserPlus className="size-5" />}
          tone="sun"
          label={t('students.statNew', lang)}
          value={`+${fmt.format(newThisMonth)}`}
          action={{ href: withParams({}, { admitted: 'month' }), label: t('students.statView', lang) }}
        />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(s) => s.id}
        rowLabel={(s) => s.full_name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('students.listTitle', lang)}
        search={{ placeholder: t('students.search', lang) }}
        filters={[
          { param: 'classSection', label: t('students.classSection', lang), options: roster.combos },
          {
            param: 'fee',
            label: t('students.feeStanding', lang),
            options: (['paid', 'partial', 'due'] as const).map((v) => ({ value: v, label: t(FEE_LABEL[v], lang) })),
          },
        ]}
        chips={[
          { param: 'fee', value: 'due', label: t('students.chipFeeDue', lang) },
          { param: 'fee', value: 'partial', label: t('students.chipFeePartial', lang) },
          { param: 'admitted', value: 'month', label: t('students.chipNewThisMonth', lang) },
        ]}
        rowActions={(s) => (
          <>
            <PrintTrigger
              href={`/school/students/${s.id}/print/id-card`}
              label={`${t('students.idCard', lang)}: ${s.full_name}`}
              icon={<IdCard className="size-4" aria-hidden />}
              iconOnly
            />
            <ViewLink id={s.id} params={params} label={t('table.profile', lang)} name={s.full_name} />
          </>
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
