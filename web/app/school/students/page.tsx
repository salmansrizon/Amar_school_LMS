import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { canOpenScreen } from '@/lib/auth/screens'
import { numberFmt } from '@/lib/i18n'
import { loadDirectoryRows } from './directory-rows'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import type { RosterStudent } from '@/lib/school/roster'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { EntityAvatar } from '@/components/entity-avatar'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { RowMenu } from '@/components/data-table/row-menu'
import { PrintTrigger } from '@/components/print/print-trigger'
import { StatCard, StatGrid, WarningBanner, WorkflowCard } from '@/components/ui/widgets'
import { RowActionPill } from '@/components/data-table/row-action-pill'
import { withParams } from '@/lib/url-params'
import { IdCard, SquarePen, UserPlus, Users, Wallet, HandCoins } from 'lucide-react'
import { getStudent, StudentProfile } from './[id]/student-profile'
import { RowMore } from '@/components/data-table/row-more'
import { bulkRemindStudents } from './actions'
import type { BulkAction } from '@/components/data-table/selection'
import { DrawerFooter, DrawerHeader } from '@/components/data-table/drawer-parts'
import { StudentDrawerBody, loadStudentDrawerData, studentDrawerCancelHref } from './student-drawer'

// Layout per Design System/new_ui/02-people/student-directory (map 013, P1),
// following the exam landing pattern (013 A3): header + subtitle, a one-line
// fee-due warning banner, four stat cards, a titled DataTable (one contextual
// next-step pill per row, everything else behind ⋮), then two workflow cards
// — admissions/profile completion and fee-due follow-up. The Class column
// renders the full shared Class Catalogue label (issue #621's follow-up), not
// a bare class_name/section join — same format every picker in the app
// already uses.
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
const primaryClass =
  'inline-flex h-11 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600'

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classSection?: string; fee?: string; admitted?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', classSection = '', fee, admitted, page, size, view } = params
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const lang: Lang = await currentLang()
  const { role, grants } = await getSchoolContext()
  // The Remind row action opens SMS Center, which rides the `sms` grant.
  const canSms = canOpenScreen(role, grants, 'sms')
  // new_ui/02-people: the directory's checkbox + bulk-action bar (map 013),
  // wired to the one bulk action that already has somewhere to go — SMS
  // Center's existing `?students=` prefill (bulkRemindStudents). Bulk ID-card
  // print isn't here: unlike this, it needs the PrintTrigger popup opened
  // from the CURRENT client selection, which the bulk bar's plain
  // <form action> shape can't drive without a components/data-table change.
  const bulkActions: BulkAction[] = canSms ? [{ label: t('students.remind', lang), action: bulkRemindStudents }] : []
  const [{ roster, fees, rows, showYear, admittedThisMonth }, viewed, studentDrawerData] = await Promise.all([
    loadDirectoryRows({ q, classSection, fee, admitted }),
    view ? getStudent(view) : Promise.resolve(null),
    view ? loadStudentDrawerData(view) : Promise.resolve(null),
  ])
  const viewedRoster = view ? (roster.students.find((s) => s.id === view) ?? null) : null
  const pageData = paginate(rows, page, pageSize)
  const fmt = numberFmt(lang)
  const n = (x: number) => fmt.format(x)
  const dash = <span className="text-muted">—</span>
  const dueList = roster.readable.filter((s) => fees.get(s.id)?.standing === 'due')
  const partialList = roster.readable.filter((s) => fees.get(s.id)?.standing === 'partial')
  const totalDueAmt = dueList.reduce((sum, s) => sum + (fees.get(s.id)?.due ?? 0), 0)
  const newThisMonthList = roster.readable.filter(admittedThisMonth)
  const newThisMonth = newThisMonthList.length
  // "Complete" means a guardian's mobile is on file — the one contact field
  // every downstream feature (Remind, SMS, ID card) actually depends on.
  const incompleteProfiles = newThisMonthList.filter((s) => !s.guardian_mobile)

  const columns: Column<RosterStudent>[] = [
    {
      key: 'name',
      header: t('students.name', lang),
      card: 'title',
      cell: (s) => (
        <div className="flex items-center gap-3">
          <EntityAvatar name={s.full_name} id={s.id} />
          <div className="min-w-0">
            <Link
              href={withParams(params, { view: s.id })}
              scroll={false}
              data-view-link={s.id}
              className="truncate font-semibold hover:text-brand-600 hover:underline"
            >
              {s.full_name}
            </Link>
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
          // Due fees need attention now; paid/partial are informational, no pulse.
          <Pill tone={FEE_TONE[f.standing]} pulse={f.standing === 'due'}>
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
        subtitle={t('students.pageSubtitle', lang)}
        crumbs={schoolCrumbs('/school/students', lang, { label: t('students.listTitle', lang) })}
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
            <Link href="/school/students/new" className={primaryClass}>
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

      {dueList.length > 0 && (
        <WarningBanner
          label={t('students.statFeeDue', lang)}
          text={`${dueList
            .slice(0, 3)
            .map((s) => s.full_name)
            .join(', ')}${dueList.length > 3 ? ` +${n(dueList.length - 3)}` : ''}`}
          href="/school/students?fee=due"
          linkLabel={t('students.viewDueList', lang)}
        />
      )}

      <StatGrid>
        <StatCard
          icon={<Users className="size-5" />}
          tone="mint"
          label={t('students.statTotal', lang)}
          value={n(roster.readable.length)}
          note={`${n(roster.classes.length)} ${t('students.classesWord', lang)}`}
          noteTone="muted"
          action={{ href: '/school/students/new', label: t('students.newAdmission', lang) }}
        />
        <StatCard
          icon={<Wallet className="size-5" />}
          tone={dueList.length ? 'alert' : 'muted'}
          label={t('students.statFeeDue', lang)}
          value={n(dueList.length)}
          note={dueList.length ? `৳${fmt.format(totalDueAmt)} ${t('students.statFeeDueNote', lang)}` : undefined}
          noteTone="alert"
          action={dueList.length ? { href: withParams({}, { fee: 'due' }), label: t('students.statView', lang) } : undefined}
        />
        <StatCard
          icon={<HandCoins className="size-5" />}
          tone={partialList.length ? 'sun' : 'muted'}
          label={t('students.statFeePartial', lang)}
          value={n(partialList.length)}
          note={partialList.length ? `${n(partialList.length)} ${t('students.statFeePartialNote', lang)}` : undefined}
          noteTone="sun"
          action={
            partialList.length ? { href: withParams({}, { fee: 'partial' }), label: t('students.statView', lang) } : undefined
          }
        />
        <StatCard
          icon={<UserPlus className="size-5" />}
          tone="sky"
          label={t('students.statNew', lang)}
          value={`+${n(newThisMonth)}`}
          note={
            newThisMonth ? `${n(incompleteProfiles.length)} ${t('students.incompleteProfilesNote', lang)}` : undefined
          }
          noteTone={incompleteProfiles.length ? 'alert' : 'muted'}
          action={newThisMonth ? { href: withParams({}, { admitted: 'month' }), label: t('students.statView', lang) } : undefined}
        />
      </StatGrid>

      <h2 className="mb-grid mt-section text-lg font-extrabold">{t('students.tableTitle', lang)}</h2>
      <DataTable
        rows={pageData.items}
        rowId={(s) => s.id}
        rowLabel={(s) => s.full_name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('students.listTitle', lang)}
        search={{ placeholder: t('students.search', lang) }}
        bulkActions={bulkActions}
        filters={[
          { param: 'classSection', label: t('students.classSection', lang), options: roster.combos },
          {
            param: 'fee',
            label: t('students.feeStanding', lang),
            options: (['paid', 'partial', 'due'] as const).map((v) => ({ value: v, label: t(FEE_LABEL[v], lang) })),
          },
        ]}
        chips={[
          { param: 'fee', value: 'due', label: `${t('students.chipFeeDue', lang)} (${n(dueList.length)})` },
          { param: 'fee', value: 'partial', label: `${t('students.chipFeePartial', lang)} (${n(partialList.length)})` },
          { param: 'admitted', value: 'month', label: `${t('students.chipNewThisMonth', lang)} (${n(newThisMonth)})` },
        ]}
        rowActions={(s) => {
          const dueOrPartial = fees.get(s.id)?.standing === 'due' || fees.get(s.id)?.standing === 'partial'
          const next =
            canSms && dueOrPartial
              ? { state: 'next' as const, href: `/school/sms?students=${s.id}`, label: t('students.remind', lang), scroll: true }
              : {
                  state: 'default' as const,
                  href: withParams(params, { view: s.id }),
                  label: t('students.view', lang),
                  scroll: false,
                }
          return (
            <div className="flex items-center justify-end gap-1">
              <RowActionPill state={next.state} href={next.href} label={next.label} scroll={next.scroll} />
              <RowMore label={`${t('students.moreActions', lang)}: ${s.full_name}`}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <PrintTrigger
                    href={`/school/students/${s.id}/print/id-card`}
                    label={`${t('students.idCard', lang)}: ${s.full_name}`}
                    icon={<IdCard className="size-4" aria-hidden />}
                  />
                  <Link
                    href={`/school/students/${s.id}`}
                    className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
                  >
                    {t('students.view', lang)}
                  </Link>
                  <Link
                    href={`/school/students/${s.id}/transfer`}
                    className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-xs font-semibold hover:bg-paper-muted"
                  >
                    {t('students.transfer', lang)}
                  </Link>
                </div>
              </RowMore>
            </div>
          )
        }}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={empty}
      />

      <div className="mt-section grid gap-grid lg:grid-cols-2">
        <WorkflowCard
          icon={<UserPlus className="size-5" />}
          title={t('students.workflowAdmissionsTitle', lang)}
          tag={t('students.thisMonthTag', lang)}
        >
          {newThisMonth === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('students.workflowAdmissionsEmpty', lang)}
            </p>
          ) : incompleteProfiles.length === 0 ? (
            <p className="mb-4 rounded-xl border border-mint-100 bg-mint-soft p-4 text-center text-sm font-semibold text-mint-deep">
              {t('students.workflowAdmissionsAllComplete', lang)} ({n(newThisMonth)})
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {incompleteProfiles.slice(0, 5).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.full_name}</p>
                    <p className="text-xs text-muted">{classLabelFor(s, showYear) ?? dash}</p>
                  </div>
                  <RowActionPill
                    state="next"
                    href={withParams(params, { view: s.id })}
                    label={t('students.completeProfile', lang)}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto border-t border-line pt-4 text-center">
            <Link href="/school/students/new" className={primaryClass}>
              + {t('students.newAdmission', lang)}
            </Link>
          </div>
        </WorkflowCard>

        <WorkflowCard icon={<Wallet className="size-5" />} title={t('students.workflowFeeTitle', lang)} tag={t('students.thisMonthTag', lang)}>
          {dueList.length === 0 ? (
            <p className="mb-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('students.workflowFeeEmpty', lang)}
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line">
              {dueList.slice(0, 5).map((s) => {
                const due = fees.get(s.id)?.due ?? 0
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.full_name}</p>
                      <p className="text-xs text-muted">৳{fmt.format(due)}</p>
                    </div>
                    {canSms ? (
                      <RowActionPill state="next" href={`/school/sms?students=${s.id}`} label={t('students.remind', lang)} />
                    ) : (
                      <RowActionPill state="default" href={`/school/students/${s.id}`} label={t('students.view', lang)} />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {canSms && dueList.length > 0 && (
            <div className="mt-auto border-t border-line pt-4 text-center">
              <Link href={`/school/sms?students=${dueList.slice(0, 50).map((s) => s.id).join(',')}`} className={primaryClass}>
                {t('students.workflowFeeRemindAll', lang)}
              </Link>
            </div>
          )}
        </WorkflowCard>
      </div>

      <RecordDrawer
        open={Boolean(viewed)}
        title={viewed?.full_name ?? ''}
        header={
          viewed && (
            <DrawerHeader
              name={viewed.full_name}
              avatarId={viewed.id}
              subtitle={viewed.roll_number != null ? `${t('students.roll', lang)} ${viewed.roll_number}` : undefined}
            />
          )
        }
        footer={
          viewed && (
            <DrawerFooter
              cancelHref={studentDrawerCancelHref(params)}
              cancelLabel={t('routine.cancel', lang)}
              primary={{
                href: `/school/students/${viewed.id}`,
                label: t('students.editProfile', lang),
                icon: <SquarePen className="size-4" aria-hidden />,
              }}
            />
          )
        }
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed &&
          (viewedRoster ? (
            <StudentDrawerBody
              student={viewedRoster}
              currentFee={fees.get(viewed.id)}
              data={studentDrawerData ?? { recentFees: [], recentLeaves: [] }}
              showYear={showYear}
              lang={lang}
            />
          ) : (
            <StudentProfile id={viewed.id} lang={lang} />
          ))}
      </RecordDrawer>
    </>
  )
}
