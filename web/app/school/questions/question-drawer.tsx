import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, Tag } from 'lucide-react'
import { t, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Card } from '@/components/ui/page'
import { Markdown } from '@/components/markdown'
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
  earlier = [],
  lang,
}: {
  topic: string
  askedAt: string
  body: string
  replyArea: ReactNode
  /** Other messages of the same thread (#703 item 5.4), oldest first. */
  earlier?: { id: string; href: string; askedAt: string; body: string }[]
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
        <Markdown text={body} />
      </Card>
      {replyArea}
      {earlier.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold text-muted">{t('questions.earlierInThread', lang)}</h3>
          <ul className="space-y-2">
            {earlier.map((m) => (
              <li key={m.id} className="rounded-md border border-line p-3">
                <Link href={m.href} scroll={false} className="text-xs font-semibold text-brand-600 hover:underline">
                  {m.askedAt}
                </Link>
                <Markdown className="mt-1" text={m.body} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function questionDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
