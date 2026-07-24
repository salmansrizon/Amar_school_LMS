'use client'

import { AuthCard } from '@/components/auth-card'
import { t } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'

// Branded fallback for an unknown subdomain (issue #109). proxy.ts rewrites here
// when a tenant-shaped host resolves to no school.
export default function NoSuchSchoolPage() {
  const lang = useLang()
  return (
    <AuthCard lang={lang} title={t('noSchool.title', lang)}>
      <p className="text-sm text-muted">{t('noSchool.body', lang)}</p>
    </AuthCard>
  )
}
