import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { LogoutButton } from '@/components/logout-button'
import { Icon } from '@/components/school-icons'
import { PageHeader } from '@/components/ui/page'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { pageTitle } from '@/lib/page-title'

// The logged-in user's account page, reached from the topbar avatar.
export const generateMetadata = pageTitle('profile.title')

export default async function ProfilePage() {
  const lang: Lang = await currentLang()
  const { fullName, email, role, schoolName } = await getSchoolContext()

  const rows: { label: string; value: string }[] = [
    { label: t('profile.name', lang), value: fullName || '—' },
    { label: t('profile.email', lang), value: email || '—' },
    { label: t('profile.role', lang), value: t(role === 'school_owner' ? 'profile.roleOwner' : 'profile.roleStaff', lang) },
    { label: t('profile.school', lang), value: schoolName || '—' },
  ]

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title={t('profile.title', lang)}
        backHref="/school"
        backLabel={t('common.back', lang)}
        crumbs={schoolCrumbs('/school/profile', lang, { label: t('profile.title', lang) })}
      />

      <div className="rounded-2xl border border-line/70 bg-paper/92 p-6 shadow-card backdrop-blur">
        <div className="mb-6 flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
            {(fullName || email || 'A').trim()[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold text-ink">{fullName || email}</div>
            <div className="text-sm text-muted">{t(role === 'school_owner' ? 'profile.roleOwner' : 'profile.roleStaff', lang)}</div>
          </div>
        </div>

        <dl className="divide-y divide-line/70">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-sm font-semibold text-muted">{r.label}</dt>
              <dd className="min-w-0 truncate text-sm font-medium text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <LogoutButton
            label={t('shell.logout', lang)}
            icon={<Icon name="logout" className="size-4 shrink-0" />}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line-strong bg-paper px-4 text-sm font-semibold text-ink transition hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          />
        </div>
      </div>
    </div>
  )
}
