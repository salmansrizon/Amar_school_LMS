import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import {
  averageRating,
  ratingDistribution,
  averageByCategory,
  responseRate,
  CATEGORY_KEYS,
  type CategoryKey,
} from '@/lib/feedback'
import { LogRatingForm } from './rating-controls'
import { AddDetails } from '@/components/add-details'

// Layout per ui/school-owner/feedback-ratings.html: 3 KPI cards, a rating
// distribution bar chart, and an average-by-category bar chart (issue #38).

function Bar({ label, pct, valueLabel }: { label: string; pct: number; valueLabel: string }) {
  return (
    <div className="mb-2 flex items-center gap-3 text-sm">
      <div className="w-28 shrink-0">{label}</div>
      <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-paper-muted">
        <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="w-12 shrink-0 text-right text-muted">{valueLabel}</div>
    </div>
  )
}

const categoryLabelKey: Record<CategoryKey, 'feedback.categoryTeaching' | 'feedback.categoryFacilities' | 'feedback.categoryCommunication' | 'feedback.categorySafety'> = {
  teaching: 'feedback.categoryTeaching',
  facilities: 'feedback.categoryFacilities',
  communication: 'feedback.categoryCommunication',
  safety: 'feedback.categorySafety',
}

export default async function FeedbackRatingsPage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: ratings }, { count: totalMessages }, { count: answeredMessages }] = await Promise.all([
    supabase
      .from('satisfaction_ratings')
      .select('overall_rating, category_teaching, category_facilities, category_communication, category_safety')
      .eq('scope', 'institute'),
    supabase.from('feedback_messages').select('*', { count: 'exact', head: true }),
    supabase.from('feedback_messages').select('*', { count: 'exact', head: true }).eq('status', 'answered'),
  ])

  const rows = ratings ?? []
  const overallValues = rows.map((r) => r.overall_rating)
  const avg = averageRating(overallValues)
  const distribution = ratingDistribution(overallValues)
  const byCategory = averageByCategory(
    rows.map((r) => ({
      teaching: r.category_teaching,
      facilities: r.category_facilities,
      communication: r.category_communication,
      safety: r.category_safety,
    })),
  )
  const rate = responseRate(totalMessages ?? 0, answeredMessages ?? 0)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('feedback.tabRatings', lang)}</h1>
        <Link href="/school" aria-label={t('common.back', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>

      <nav className="mb-5 flex gap-1 border-b border-line text-sm font-semibold">
        <Link href="/school/feedback" className="rounded-t-md px-4 py-2 text-muted hover:bg-paper hover:text-ink">
          {t('feedback.tabInbox', lang)}
        </Link>
        <span className="rounded-t-md bg-paper px-4 py-2 text-ink">{t('feedback.tabRatings', lang)}</span>
      </nav>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('feedback.avgRating', lang)}</div>
          <div className="mt-1 text-2xl font-extrabold">{avg === null ? '—' : `${avg} / 5`}</div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('feedback.totalResponses', lang)}</div>
          <div className="mt-1 text-2xl font-extrabold">{rows.length}</div>
        </div>
        <div className="rounded-lg border border-line bg-paper p-4 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('feedback.responseRate', lang)}</div>
          <div className="mt-1 text-2xl font-extrabold">{rate}%</div>
          {/* Distinct source from the two KPIs to its left (satisfaction_ratings):
              this is the share of inbox messages the School has answered. */}
          <div className="mt-1 text-xs text-muted">{t('feedback.responseRateHint', lang)}</div>
        </div>
      </div>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h3 className="mb-3 mt-0 font-bold">{t('feedback.distribution', lang)}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{t('feedback.noRatings', lang)}</p>
        ) : (
          distribution.map((b) => (
            <Bar key={b.star} label={`${b.star} ${t('feedback.star', lang)}`} pct={b.pct} valueLabel={`${b.pct}%`} />
          ))
        )}
      </section>

      <section className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h3 className="mb-3 mt-0 font-bold">{t('feedback.byCategory', lang)}</h3>
        {CATEGORY_KEYS.map((key) => {
          const value = byCategory[key]
          return (
            <Bar
              key={key}
              label={t(categoryLabelKey[key], lang)}
              pct={value === null ? 0 : (value / 5) * 100}
              valueLabel={value === null ? '—' : String(value)}
            />
          )
        })}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <AddDetails label={t('feedback.logRating', lang)}>
          <LogRatingForm lang={lang} />
        </AddDetails>
      </section>
    </main>
  )
}
