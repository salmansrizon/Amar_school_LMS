import { Star, MessageCircleReply, Percent } from 'lucide-react'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { schoolCrumbs } from '@/lib/school-crumbs'
import {
  averageRating,
  ratingDistribution,
  averageByCategory,
  responseRate,
  CATEGORY_KEYS,
  type CategoryKey,
} from '@/lib/feedback'
import { Card, PageHeader } from '@/components/ui/page'
import { StatCard, StatGrid } from '@/components/ui/widgets'
import { SectionTabs } from '@/components/ui/section-tabs'
import { LogRatingForm } from './rating-controls'
import { AddDetails } from '@/components/add-details'
import { pageTitle } from '@/lib/page-title'

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

export const generateMetadata = pageTitle('feedback.tabRatings')

export default async function FeedbackRatingsPage() {
  const lang: Lang = await currentLang()
  const { supabase } = await getSchoolContext()

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
    <>
      <PageHeader
        title={t('feedback.tabRatings', lang)}
        crumbs={schoolCrumbs('/school/feedback/ratings', lang, [
          { label: t('feedback.title', lang), href: '/school/feedback' },
          { label: t('feedback.tabRatings', lang) },
        ])}
      />

      <SectionTabs
        label={t('feedback.title', lang)}
        active="/school/feedback/ratings"
        lang={lang}
        tabs={[
          { href: '/school/feedback', labelKey: 'feedback.tabInbox' },
          { href: '/school/feedback/ratings', labelKey: 'feedback.tabRatings' },
        ]}
      />

      <StatGrid>
        <StatCard icon={<Star className="size-5" />} tone="sun" label={t('feedback.avgRating', lang)} value={avg === null ? '—' : `${avg} / 5`} />
        <StatCard icon={<MessageCircleReply className="size-5" />} label={t('feedback.totalResponses', lang)} value={String(rows.length)} />
        <StatCard
          icon={<Percent className="size-5" />}
          tone="mint"
          label={t('feedback.responseRate', lang)}
          value={`${rate}%`}
          note={t('feedback.responseRateHint', lang)}
        />
      </StatGrid>

      <Card className="mb-grid">
        <h3 className="mb-3 mt-0 font-bold">{t('feedback.distribution', lang)}</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{t('feedback.noRatings', lang)}</p>
        ) : (
          distribution.map((b) => (
            <Bar key={b.star} label={`${b.star} ${t('feedback.star', lang)}`} pct={b.pct} valueLabel={`${b.pct}%`} />
          ))
        )}
      </Card>

      <Card className="mb-grid">
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
      </Card>

      <Card>
        <AddDetails label={t('feedback.logRating', lang)}>
          <LogRatingForm lang={lang} />
        </AddDetails>
      </Card>
    </>
  )
}
