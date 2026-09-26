import Link from 'next/link'
import { redirect } from 'next/navigation'
import { KeyRound, ShieldCheck, ShieldOff, Users } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { navGroupFor } from '@/lib/school-nav'
import { GRANTABLE_SCREENS } from '@/lib/auth/screens'
import { selectAllRows } from '@/lib/supabase/select-all'
import { withParams } from '@/lib/url-params'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { EmptyState } from '@/components/ui/states'
import { paginate, pageSizeFrom } from '@/components/pager'
import { EntityAvatar } from '@/components/entity-avatar'
import { DataTable, Pill, type Column } from '@/components/data-table/data-table'
import { RecordDrawer } from '@/components/data-table/record-drawer'
import { ViewLink } from '@/components/data-table/view-link'
import { CreateStaffForm } from './create-staff-form'
import { GrantList } from './[id]/grant-list'

// Staff permissions (map 013, AD2), per new_ui/05-administration/staff-permissions:
// header + stat cards + DataTable with a per-row grant summary. The row's
// Permissions button opens the same toggles as /school/staff/[id] in a drawer;
// `?view=new` opens the create-login form there. Grant reads/writes unchanged —
// RLS is still the authority (actions.ts).

type Row = { id: string; name: string; createdAt: string; screens: string[] }

const PAGE_SIZE = 20
const NEW = 'new'

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; access?: string; page?: string; size?: string; view?: string }>
}) {
  const params = await searchParams
  const { q = '', access = '', page, size, view } = params
  const lang: Lang = await currentLang()
  const { supabase, role } = await getSchoolContext()
  if (role !== 'school_owner') redirect('/school')

  const [{ rows: staff }, { rows: grants }] = await Promise.all([
    selectAllRows((from, to) =>
      supabase.from('profiles').select('id, full_name, created_at').eq('role', 'staff_user').order('created_at').range(from, to),
    ),
    selectAllRows((from, to) =>
      supabase.from('staff_permissions').select('staff_user_id, screen_key').range(from, to),
    ),
  ])

  const screensBy = new Map<string, string[]>()
  for (const g of grants) screensBy.set(g.staff_user_id, [...(screensBy.get(g.staff_user_id) ?? []), g.screen_key])
  const titleOf = new Map(GRANTABLE_SCREENS.map((s) => [s.key as string, t(s.titleKey, lang)]))

  const all: Row[] = staff.map((s) => ({
    id: s.id,
    name: s.full_name ?? s.id,
    createdAt: s.created_at,
    // Only keys the toggles know; order follows GRANTABLE_SCREENS.
    screens: GRANTABLE_SCREENS.map((sc) => sc.key as string).filter((k) => screensBy.get(s.id)?.includes(k)),
  }))

  const needle = q.trim().toLowerCase()
  const visible = all.filter(
    (r) =>
      (!needle || r.name.toLowerCase().includes(needle)) &&
      (!access || (access === 'none' ? r.screens.length === 0 : r.screens.length > 0)),
  )
  const pageSize = pageSizeFrom(size, PAGE_SIZE)
  const pageData = paginate(visible, page, pageSize)

  const fmt = numberFmt(lang)
  const withAccess = all.filter((r) => r.screens.length > 0).length
  const noAccess = all.length - withAccess
  const date = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Dhaka' })
  const group = navGroupFor('/school/staff')?.group
  const viewed = view && view !== NEW ? all.find((r) => r.id === view) : undefined

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: t('staff.name', lang),
      card: 'title',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <EntityAvatar name={r.name} id={r.id} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{r.name}</div>
            <div className="text-xs text-muted">
              {t('staff.joined', lang)} {date.format(new Date(r.createdAt))}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'screens',
      header: t('staff.grantedScreens', lang),
      cell: (r) =>
        r.screens.length ? (
          <div className="flex max-w-md flex-wrap gap-1">
            {r.screens.slice(0, 3).map((k) => (
              <span key={k} className="rounded-md border border-line bg-paper-muted px-2 py-0.5 text-xs">
                {titleOf.get(k)}
              </span>
            ))}
            {r.screens.length > 3 && (
              <span className="px-1 py-0.5 text-xs text-muted">+{fmt.format(r.screens.length - 3)}</span>
            )}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'access',
      header: t('staff.access', lang),
      card: 'badge',
      cell: (r) =>
        r.screens.length ? (
          <Pill tone="mint">
            {fmt.format(r.screens.length)} {t('staff.screenCount', lang)}
          </Pill>
        ) : (
          // No screens granted needs attention; a granted count is a steady fact.
          <Pill tone="muted" pulse>
            {t('staff.noAccess', lang)}
          </Pill>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('staff.title', lang)}
        crumbs={{
          lang,
          items: [
            { label: t('dash.dashboard', lang), href: '/school' },
            ...(group ? [{ label: t(group.labelKey, lang) }] : []),
            { label: t('staff.title', lang) },
          ],
        }}
        badge={`${t('pager.total', lang)}: ${fmt.format(all.length)}`}
        actions={
          <Link
            href={withParams(params, { view: NEW })}
            scroll={false}
            className="inline-flex h-11 items-center rounded-full bg-brand-500 px-4 text-xs font-semibold text-white hover:bg-brand-600"
          >
            + {t('staff.create', lang)}
          </Link>
        }
      />

      <Card tone="sun" className="mb-section">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-sun-deep" aria-hidden />
          {t('staff.ownerNoteTitle', lang)}
        </p>
        <p className="mt-1 text-xs text-muted">{t('staff.ownerNote', lang)}</p>
      </Card>

      <StatGrid>
        <StatCard
          icon={<Users className="size-5" />}
          label={t('staff.totalStaff', lang)}
          value={fmt.format(all.length)}
          note={t('staff.loginsNote', lang)}
          noteTone="muted"
        />
        <StatCard
          icon={<ShieldCheck className="size-5" />}
          tone="mint"
          label={t('staff.withAccess', lang)}
          value={fmt.format(withAccess)}
          note={t('staff.withAccessNote', lang)}
        />
        <StatCard
          icon={<ShieldOff className="size-5" />}
          tone={noAccess ? 'sun' : 'muted'}
          label={t('staff.noAccess', lang)}
          value={fmt.format(noAccess)}
          note={t('staff.noAccessNote', lang)}
        />
        <StatCard
          icon={<KeyRound className="size-5" />}
          tone="sky"
          label={t('staff.grantableScreens', lang)}
          value={fmt.format(GRANTABLE_SCREENS.length)}
          note={t('staff.grantableNote', lang)}
        />
      </StatGrid>

      <DataTable
        rows={pageData.items}
        rowId={(r) => r.id}
        rowLabel={(r) => r.name}
        columns={columns}
        lang={lang}
        params={params}
        caption={t('staff.list', lang)}
        search={{ placeholder: t('staff.searchName', lang) }}
        chips={[
          { param: 'access', value: 'some', label: `${t('staff.withAccess', lang)} (${fmt.format(withAccess)})` },
          { param: 'access', value: 'none', label: `${t('staff.noAccess', lang)} (${fmt.format(noAccess)})` },
        ]}
        rowActions={(r) => <ViewLink id={r.id} params={params} label={t('staff.permissions', lang)} name={r.name} />}
        rowMenu={(r) => [{ label: t('table.openFullPage', lang), href: `/school/staff/${r.id}` }]}
        pagination={{ page: pageData.page, totalPages: pageData.totalPages, total: pageData.total, pageSize }}
        empty={
          all.length ? (
            <EmptyState
              title={t('staff.noMatch', lang)}
              action={{ href: '/school/staff', label: t('students.clearFilters', lang) }}
              lang={lang}
            />
          ) : (
            <EmptyState
              title={t('staff.none', lang)}
              action={{ href: `/school/staff?view=${NEW}`, label: t('staff.create', lang) }}
              lang={lang}
            />
          )
        }
      />

      <RecordDrawer
        open={view === NEW || Boolean(viewed)}
        title={viewed ? viewed.name : t('staff.create', lang)}
        subtitle={viewed ? t('staff.screens', lang) : undefined}
        fullPageHref={viewed ? `/school/staff/${viewed.id}` : undefined}
        fullPageLabel={t('table.openFullPage', lang)}
        closeLabel={t('common.close', lang)}
      >
        {viewed ? (
          <GrantList staffUserId={viewed.id} granted={new Set(viewed.screens)} lang={lang} />
        ) : view === NEW ? (
          <CreateStaffForm lang={lang} />
        ) : null}
      </RecordDrawer>
    </>
  )
}
