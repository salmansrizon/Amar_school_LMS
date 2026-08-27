import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { groupByTopic, isAnswered, type InboxMessage } from '@/lib/student/messages'
import { hubSummary, answerableMessageIds } from '@/lib/student/hub-source'
import { waitingHours, waitingTone } from '@/lib/student/hub'
import { Card, PageHeader } from '@/components/ui/page'
import { HubTabs } from '../messages-hub-tabs'
import { ReplyForm } from './reply-form'

// The Questions tab of বার্তা ও অনুরোধ (#454 inbox, #509 section).
//
// Grouping IS the feature. A flat chronological list would make a teacher sort
// twenty questions about the same task in their head; gathered under the post
// they were asked about, the answer is usually one reply repeated — or one
// correction to the task itself.
//
// The topic with the most unanswered questions floats to the top, because that
// is the one to open next. WHO sees which questions is not decided here — 0152
// scopes the table itself, so this page issues one unscoped query and the
// database hands a Class Teacher her own classes and the Owner the school
// (ADR 0018).
export default async function SchoolQuestionsPage() {
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data } = await supabase
    .from('student_message_inbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  const messages = (data ?? []) as InboxMessage[]
  const groups = groupByTopic(messages)
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  // This page is already holding every row the questions badge would count, so
  // it counts them here and buys only the corrections query.
  //
  // `answerable` is one extra scan, not one call per row: a Subject Teacher sees
  // every question from the classes he teaches, and may answer only the ones
  // anchored to work he set (ADR 0018). Offering a reply box on the rest and
  // refusing after he has typed an answer is a bad way to teach that rule.
  const [summary, answerable] = await Promise.all([
    hubSummary(supabase, {
      skip: 'questions',
      known: messages.filter((m) => !isAnswered(m)).length,
    }),
    answerableMessageIds(supabase),
  ])

  return (
    <>
      <PageHeader title={t('hub.title', lang)} />
      <HubTabs active="/school/questions" lang={lang} summary={summary} />

      {!groups.length ? (
        <Card>
          <p className="text-sm text-muted">
            {summary.reachesAnyClass ? t('questions.none', lang) : t('hub.noClasses', lang)}
          </p>
        </Card>
      ) : (
        <div className="space-y-grid">
          {groups.map((group) => (
            <Card key={group.key}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">
                  {group.label}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {group.kind === 'post' ? '' : t('questions.generalBucket', lang)}
                  </span>
                </h2>
                {group.unanswered > 0 && (
                  <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs font-semibold text-sun-deep">
                    {group.unanswered} {t('questions.unanswered', lang)}
                  </span>
                )}
              </div>

              <ul className="space-y-2">
                {group.messages.map((m) => {
                  const tone = waitingTone(m)
                  const hours = waitingHours(m)
                  return (
                    <li key={m.id}>
                      {/* The rail carries the waiting-age, per components/ui/page.tsx —
                          no rail while fresh, sun past 24h, alert past 72h, mint once
                          answered. It is always paired with the text below it; the
                          colour never carries the meaning alone. */}
                      <Card tone={tone} className="p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold">{m.subject}</span>
                          {/* The elapsed figure is only a REPLY time when there
                              is a replied_at to measure to. A row with a reply
                              body and no timestamp — 0148 allows it, and the
                              seed has some — would otherwise print its waiting
                              time under the word "answered". */}
                          <span className="text-xs text-muted">
                            {m.replied_at
                              ? `${hours}${t('hub.answeredIn', lang)}`
                              : m.reply_body
                                ? t('questions.replied', lang)
                                : hours < 1
                                  ? t('hub.freshlyAsked', lang)
                                  : `${hours}${t('hub.waitingHours', lang)}`}
                          </span>
                        </div>

                        {/* Card anatomy, both queues: waiting-age, student name,
                            class/section — enough to know who is waiting without
                            opening anything. */}
                        <p className="mt-0.5 text-xs text-muted">
                          {m.student_name}
                          {m.class_name && ` · ${m.class_name}${m.section ? ` ${m.section}` : ''}`}
                          {m.roll_number !== null && ` · #${m.roll_number}`} ·{' '}
                          {new Date(m.created_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>

                        {m.reply_body ? (
                          <div className="mt-2 rounded-md bg-mint-soft p-2">
                            <span className="text-xs font-semibold text-mint-deep">
                              {t('questions.replied', lang)}
                            </span>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{m.reply_body}</p>
                          </div>
                        ) : answerable === null || answerable.has(m.id) ? (
                          <ReplyForm lang={lang} messageId={m.id} />
                        ) : (
                          // Visible to him, not his to answer. Said once, here,
                          // rather than after he has written a reply.
                          <p className="mt-2 text-xs italic text-muted">
                            {t('questions.notYours', lang)}
                          </p>
                        )}
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
