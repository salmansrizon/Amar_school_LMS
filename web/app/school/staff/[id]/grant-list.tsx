import { GRANTABLE_SCREENS } from '@/lib/auth/screens'
import { t, type Lang } from '@/lib/i18n'
import { ScreenToggle } from './screen-toggle'

/** One toggle per grantable screen. Shared by the full page and the list's
 *  drawer (map 013, AD2); the toggle and its server action are unchanged. */
export function GrantList({ staffUserId, granted, lang }: { staffUserId: string; granted: Set<string>; lang: Lang }) {
  return (
    <ul className="divide-y divide-line">
      {GRANTABLE_SCREENS.map((screen) => (
        <li key={screen.key} className="flex items-center justify-between py-2.5">
          <span className="text-sm font-medium">{t(screen.titleKey, lang)}</span>
          <ScreenToggle
            staffUserId={staffUserId}
            screenKey={screen.key}
            granted={granted.has(screen.key)}
            grantedLabel={t('staff.granted', lang)}
          />
        </li>
      ))}
    </ul>
  )
}
