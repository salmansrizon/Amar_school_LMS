import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { ActivityTable } from '@/components/activity-table'
import { Icon } from '@/components/school-icons'
import { mergeActivity } from '@/lib/dashboard'

// Full activity log — reached from the dashboard's "View All". Same three
// streams as the dashboard card (admissions / notices / feedback), just a
// larger window; each row opens the underlying record.
export default async function ActivityLogPage() {
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const [{ data: students }, { data: notices }, { data: feedback }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('publications').select('id, title, created_at').order('created_at', { ascending: false }).limit(50),
    supabase.from('feedback_messages').select('id, subject, created_at').order('created_at', { ascending: false }).limit(50),
  ])

  const activity = mergeActivity(
    { students: students ?? [], notices: notices ?? [], feedback: feedback ?? [] },
    100,
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-600">{t('dash.recentActivity', lang)}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{t('activity.title', lang)}</h1>
        </div>
        <Link
          href="/school"
          aria-label={t('common.back', lang)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <Icon name="chevronLeft" className="size-5" />
        </Link>
      </div>

      <div className="rounded-2xl border border-line/70 bg-paper/92 shadow-card backdrop-blur">
        <ActivityTable items={activity} lang={lang} emptyLabel={t('dash.raNone', lang)} />
      </div>
    </div>
  )
}
