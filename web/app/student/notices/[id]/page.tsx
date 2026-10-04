import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, formatDate } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { markPublicationRead } from '@/lib/student/notices-source'
import { isForMyClass } from '@/lib/student/notices'
import { importanceLabel } from '@/lib/publishing'
import { isReadOnly } from '@/lib/student/context'
import { AskForm } from '../../questions/ask-form'
import { Card, PageHeader } from '@/components/ui/page'

// One notice (#445). Opening it is what marks it read — there is no "mark as
// read" button, because the receipt exists to answer "what is new since I last
// looked", and a button would make that a chore the student has to remember.
export default async function StudentNoticePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await currentLang()
  const ctx = await getStudentContext()
  const { supabase, student } = ctx

  // RLS decides visibility: a notice aimed at another class is simply not here.
  const { data: notice } = await supabase
    .from('publications')
    .select('id, title, content, importance, target_scope, image_path, link_url, created_at')
    .eq('id', id)
    .eq('kind', 'notice')
    .maybeSingle()
  if (!notice) notFound()

  await markPublicationRead(supabase, student.id, notice.id)

  return (
    <main className="w-full px-gutter pt-section pb-16">
      <PageHeader
        title={notice.title}
        backHref="/student/notices"
        backLabel={t('student.backToNotices', lang)}
        crumbs={{
          lang,
          items: [
            { label: t('student.nav.home', lang), href: '/student' },
            { label: t('student.noticesTitle', lang), href: '/student/notices' },
            { label: notice.title },
          ],
        }}
        subtitle={[isForMyClass(notice) ? t('student.forMyClass', lang) : t('student.forEveryone', lang), formatDate(notice.created_at, lang)].join(' · ')}
        badge={importanceLabel(notice.importance, lang)}
      />

      <div className="grid items-start gap-grid lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {notice.image_path && (
            // eslint-disable-next-line @next/next/no-img-element -- signed-URL redirect route; next/image can't optimize it
            <img
              src={`/api/student/publication-image?id=${notice.id}`}
              alt=""
              className="mb-4 w-full rounded-lg border border-line object-cover"
            />
          )}

          {notice.content ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{notice.content}</div>
          ) : null}

          {notice.link_url && (
            <a
              href={notice.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted max-sm:min-h-11"
            >
              {t('student.openLink', lang)}
            </a>
          )}
        </Card>

        {/* "Ask about this" (#454): a question anchored to the post it came from
            is what makes the teacher's inbox groupable. */}
        {!isReadOnly(ctx) && (
          <Card>
            <h2 className="mb-3 font-bold">{t('student.askAbout', lang)}</h2>
            <AskForm lang={lang} publicationId={notice.id} />
          </Card>
        )}
      </div>
    </main>
  )
}
