import type { ReactNode } from 'react'
import { CalendarDays, Tag } from 'lucide-react'
import { t, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Card } from '@/components/ui/page'
import { DrawerFacts, type DrawerFact } from '@/components/data-table/drawer-parts'

// Question record drawer body (drawer redesign): Topic/Asked facts above the
// existing question body + reply area (ReplyForm / replied text / "not
// yours" — all unchanged, still computed by questions/page.tsx and passed in
// as children so the answerability rule (ADR 0018) never gets re-derived
// here).

export function QuestionDrawerBody({
  topic,
  askedAt,
  body,
  replyArea,
  lang,
}: {
  topic: string
  askedAt: string
  body: string
  replyArea: ReactNode
  lang: Lang
}) {
  const facts: DrawerFact[] = [
    { icon: <Tag className="size-3.5" aria-hidden />, label: t('questions.colTopic', lang), value: topic },
    { icon: <CalendarDays className="size-3.5" aria-hidden />, label: t('questions.colAsked', lang), value: askedAt },
  ]
  return (
    <div className="space-y-4">
      <DrawerFacts facts={facts} />
      <Card>
        <p className="whitespace-pre-wrap text-sm">{body}</p>
      </Card>
      {replyArea}
    </div>
  )
}

export function questionDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
