import { CalendarDays, KeyRound } from 'lucide-react'
import { t, numberFmt, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Pill } from '@/components/data-table/data-table'
import { DrawerFacts, type DrawerFact } from '@/components/data-table/drawer-parts'
import { GrantList } from './[id]/grant-list'
import { LoginToggle } from './[id]/login-toggle'
import type { StaffLoginState } from '@/lib/staff-login'

// Staff record drawer body (drawer redesign): Joined/Access facts above the
// existing GrantList (per-screen toggles — unchanged, still the RLS-backed
// server action).

export function StaffDrawerBody({
  joinedLabel,
  screenCount,
  staffUserId,
  granted,
  login,
  lang,
}: {
  joinedLabel: string
  screenCount: number
  staffUserId: string
  granted: Set<string>
  /** #688: 'unavailable' hides the control. */
  login: StaffLoginState
  lang: Lang
}) {
  const fmt = numberFmt(lang)
  const facts: DrawerFact[] = [
    { icon: <CalendarDays className="size-3.5" aria-hidden />, label: t('staff.joined', lang), value: joinedLabel },
    {
      icon: <KeyRound className="size-3.5" aria-hidden />,
      label: t('staff.access', lang),
      value: screenCount ? (
        <Pill tone="mint">
          {fmt.format(screenCount)} {t('staff.screenCount', lang)}
        </Pill>
      ) : (
        <Pill tone="muted" pulse>
          {t('staff.noAccess', lang)}
        </Pill>
      ),
    },
  ]
  return (
    <div className="space-y-4">
      <DrawerFacts facts={facts} />
      <GrantList staffUserId={staffUserId} granted={granted} lang={lang} />
      {login !== 'unavailable' && <LoginToggle staffUserId={staffUserId} disabled={login === 'disabled'} lang={lang} />}
    </div>
  )
}

export function staffDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
