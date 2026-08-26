import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { groupByTopic, type InboxMessage } from '@/lib/student/messages'
import { Card, PageHeader } from '@/components/ui/page'
import { ReplyForm } from './reply-form'

// The teacher's inbox (#454), grouped topic-wise.
//
// Grouping IS the feature. A flat chronological list would make a teacher sort
// twenty questions about the same task in their head; gathered under the post
// they were asked about, the answer is usually one reply repeated — or one
// correction to the task itself.
//
// The topic with the most unanswered questions floats to the top, because that
// is the one to open next. The School Owner sees the same page: oversight by
// default, no unmonitored adult-to-child channel (#454).
export default async function SchoolQuestionsPage() {
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()

  const { data } = await supabase
    .from('student_message_inbox')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  const groups = groupByTopic((data ?? []) as InboxMessage[])
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <>
      <PageHeader title={t('questions.title', lang)} />

      {!groups.length ? (
        <Card>
          <p className="text-sm text-muted">{t('questions.none', lang)}</p>
        </Card>
      ) : (
        <div className="space-y-4">
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

              <ul className="divide-y divide-line">
                {group.messages.map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{m.subject}</span>
                      <span className="text-xs text-muted">
                        {m.student_name}
                        {m.roll_number !== null && ` · #${m.roll_number}`} ·{' '}
                        {new Date(m.created_at).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>

                    {m.reply_body ? (
                      <div className="mt-2 rounded-md bg-mint-soft p-2">
                        <span className="text-xs font-semibold text-mint-deep">
                          {t('questions.replied', lang)}
                        </span>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{m.reply_body}</p>
                      </div>
                    ) : (
                      <ReplyForm lang={lang} messageId={m.id} />
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
