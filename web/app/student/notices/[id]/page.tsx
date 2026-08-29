import Link from 'next/link'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getStudentContext } from '@/lib/student/context'
import { markPublicationRead } from '@/lib/student/notices-source'
import { isForMyClass } from '@/lib/student/notices'
import { importanceBadgeClass, importanceLabel } from '@/lib/publishing'
import { isReadOnly } from '@/lib/student/context'
import { AskForm } from '../../questions/ask-form'

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
    .select('id, title, content, importance, target_type, image_path, link_url, created_at')
    .eq('id', id)
    .eq('kind', 'notice')
    .maybeSingle()
  if (!notice) notFound()

  await markPublicationRead(supabase, student.id, notice.id)

  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="w-full max-w-3xl p-6">
      <Link href="/student/notices" className="text-sm text-brand-600 hover:underline">
        ← {t('student.backToNotices', lang)}
      </Link>

      <div className="mt-3 mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${importanceBadgeClass(notice.importance)}`}
        >
          {importanceLabel(notice.importance, lang)}
        </span>
        <span className="text-xs text-muted">
          {isForMyClass(notice) ? t('student.forMyClass', lang) : t('student.forEveryone', lang)}
        </span>
        <span className="text-xs text-muted">
          {new Date(notice.created_at).toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      </div>

      <h1 className="mb-4 text-2xl font-extrabold">{notice.title}</h1>

      {notice.image_path && (
        // eslint-disable-next-line @next/next/no-img-element -- signed-URL redirect route; next/image can't optimize it
        <img
          src={`/api/student/publication-image?id=${notice.id}`}
          alt=""
          className="mb-4 w-full rounded-lg border border-line object-cover"
        />
      )}

      {notice.content && (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{notice.content}</div>
      )}

      {/* "Ask about this" (#454): a question anchored to the post it came from
          is what makes the teacher's inbox groupable. */}
      {!isReadOnly(ctx) && (
        <section className="mt-6 rounded-lg border border-line bg-paper p-5">
          <h2 className="mb-3 font-bold">{t('student.askAbout', lang)}</h2>
          <AskForm lang={lang} publicationId={notice.id} />
        </section>
      )}

      {notice.link_url && (
        <a
          href={notice.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
        >
          {t('student.openLink', lang)}
        </a>
      )}
    </main>
  )
}
