import { cookies } from 'next/headers'
import { currentLang } from '@/lib/i18n-server'
import { sidebarCollapsed } from '@/lib/ui-prefs-server'
import { t } from '@/lib/i18n'
import { SchoolShell } from '@/components/school-shell'
import { SubscriptionGate } from '@/components/subscription-gate'
import { SubscriptionBanner, SUB_REMINDER_COOKIE } from '@/components/subscription-banner'
import { getSchoolContext } from '@/lib/school/context'
import { loadSchoolSmsCredit } from '@/lib/sms/credit'
import { daysUntilExpiry, shouldShowReminder } from '@/lib/subscription'

// Persistent chrome for every /school/* page (sidebar + topbar per the reference
// image). Auth/profile/grants come from the per-request cached getSchoolContext()
// so this layout and the page it wraps share one set of queries (no duplication).
//
// Also carries the read-time subscription state (issue #169): an expired school
// is replaced by the "update subscription" gate; an active/trial school within
// 7 days of lapsing shows a dismissible reminder banner under the nav. Status is
// computed on read via school_subscription_status — no deactivated_at write
// (that hard block is a separate, manual super-admin switch, #161).
export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  const collapsed = await sidebarCollapsed()
  const ctx = await getSchoolContext()
  const status = ctx.subscriptionStatus
  const smsCredit = await loadSchoolSmsCredit(ctx.supabase, ctx.schoolId)

  const shellProps = {
    role: ctx.role,
    grants: ctx.grants,
    schoolName: ctx.schoolName ?? t('home.school', lang),
    fullName: ctx.fullName,
    lang,
    initialCollapsed: collapsed,
    smsCredit,
  }

  if (status === 'expired') {
    return (
      <SchoolShell {...shellProps}>
        <SubscriptionGate role={ctx.role} lang={lang} />
      </SchoolShell>
    )
  }

  // The banner is skipped once dismissed for this exact expiry window (cookie).
  const dismissedFor = (await cookies()).get(SUB_REMINDER_COOKIE)?.value
  let banner: React.ReactNode = undefined
  if (shouldShowReminder(status, ctx.subscriptionExpiresAt, dismissedFor) && ctx.subscriptionExpiresAt) {
    banner = (
      <SubscriptionBanner
        daysLeft={daysUntilExpiry(ctx.subscriptionExpiresAt)}
        expiry={ctx.subscriptionExpiresAt}
        lang={lang}
      />
    )
  }

  return (
    <SchoolShell {...shellProps} banner={banner}>
      {children}
    </SchoolShell>
  )
}
