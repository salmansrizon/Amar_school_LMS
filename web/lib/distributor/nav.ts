import type { MessageKey } from '@/lib/i18n'

// Quick-link nav shared by every /distributor/* page (passed to RoleShell).
export const DISTRIBUTOR_LINKS: { href: string; labelKey: MessageKey }[] = [
  { href: '/distributor', labelKey: 'dist.nav.dashboard' },
  { href: '/distributor/crm', labelKey: 'dist.nav.crm' },
  { href: '/distributor/onboarding', labelKey: 'dist.nav.onboarding' },
  { href: '/distributor/wallet', labelKey: 'dist.nav.wallet' },
]
