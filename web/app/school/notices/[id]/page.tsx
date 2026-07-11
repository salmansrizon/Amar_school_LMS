import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import {
  importanceBadgeClass,
  importanceLabel,
  kindBadgeClass,
  kindLabel,
  targetAudienceLabel,
} from '@/lib/publishing'
import { DeletePublicationButton } from './detail-controls'

// Shared detail view for notice/homework/lesson-plan/daily-lesson/exam-prep
// rows (issue #37: one list/detail UI pattern across all publishing kinds).
export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const { data: row } = await supabase
    .from('publications')
    .select(
      'id, kind, title, content, importance, target_type, target_class_name, target_section, target_shift_id, image_path, link_url, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (!row) notFound()

  let shiftName: string | null = null
  if (row.target_shift_id) {
    const { data: shift } = await supabase
      .from('shifts')
      .select('name')
      .eq('id', row.target_shift_id)
      .maybeSingle()
    shiftName = shift?.name ?? null
  }
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <p className="mb-4">
        <Link href="/school/notices" className="text-sm text-brand-600 hover:underline">
          ← {t('notices.tabList', lang)}
        </Link>
      </p>
      <div className="rounded-lg border border-line bg-paper p-6 shadow-card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${kindBadgeClass(row.kind)}`}>
            {kindLabel(row.kind, lang)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${importanceBadgeClass(row.importance)}`}
          >
            {importanceLabel(row.importance, lang)}
          </span>
        </div>
        <h1 className="mb-2 text-xl font-extrabold">{row.title}</h1>
        <p className="mb-4 text-sm text-muted">
          {targetAudienceLabel(
            {
              target_type: row.target_type,
              target_class_name: row.target_class_name,
              target_section: row.target_section,
            },
            shiftName,
            lang,
          )}{' '}
          · {new Date(row.created_at).toLocaleDateString(locale)}
        </p>
        {row.content && <p className="mb-4 whitespace-pre-wrap text-sm">{row.content}</p>}
        {row.image_path && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/publication-image?id=${row.id}`}
            alt=""
            className="mb-4 max-w-full rounded-md border border-line"
          />
        )}
        {row.link_url && (
          <p className="mb-4 text-sm">
            <a
              href={row.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              {row.link_url}
            </a>
          </p>
        )}
        <DeletePublicationButton id={row.id} lang={lang} />
      </div>
    </main>
  )
}
