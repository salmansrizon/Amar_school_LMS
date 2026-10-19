import { cache } from 'react'
import type { Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import {
  importanceBadgeClass,
  importanceLabel,
  kindBadgeClass,
  kindLabel,
  targetAudienceLabel,
} from '@/lib/publishing'
import { PublicationActions } from './detail-controls'
import { formatDate, t } from '@/lib/i18n'
import { Markdown } from '@/components/markdown'
import { isMissingColumnError } from '@/lib/leave-columns'
import { isUnpublished, type UnpublishedAt } from '@/lib/school/publication-status'

// Shared detail body for notice/homework/lesson-plan/daily-lesson/exam-prep
// rows (issue #37), rendered by the full page `[id]` and by the list's record
// drawer (map 013 FC3) — one fetch, one layout.

export const getNotice = cache(async (id: string) => {
  const { supabase } = await getSchoolContext()
  const { data: base } = await supabase
    .from('publications')
    .select(
      'id, kind, title, content, importance, target_scope, class_offering_id, target_class_name, target_academic_year, target_shift, target_group_department, target_section, image_path, link_url, created_at, due_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (!base) return null
  // unpublished_at is read on its own so the page works before migration 0252:
  // a missing column leaves it undefined (status unknown, no unpublish control).
  const status = await supabase.from('publications').select('unpublished_at').eq('id', id).maybeSingle()
  const unpublished_at: UnpublishedAt =
    status.error || !status.data
      ? isMissingColumnError(status.error)
        ? undefined
        : null
      : ((status.data as { unpublished_at: string | null }).unpublished_at ?? null)
  const row = { ...base, unpublished_at }

  // An 'offering'-scope row's label resolves back to the Class Catalogue name
  // (map #598 Wave 6, #607); null when the Offering was since deleted (#599).
  const { data: offering } = row.class_offering_id
    ? await supabase
        .from('class_offerings')
        .select('name, section, group_department, shift')
        .eq('id', row.class_offering_id)
        .maybeSingle()
    : { data: null }
  return { row, offering }
})

type Notice = NonNullable<Awaited<ReturnType<typeof getNotice>>>

export function noticeMeta({ row, offering }: Notice, lang: Lang): string {
  const target = targetAudienceLabel(
    {
      target_scope: row.target_scope,
      target_class_name: row.target_class_name,
      target_academic_year: row.target_academic_year ?? null,
      target_shift: row.target_shift ?? null,
      target_group_department: row.target_group_department ?? null,
      target_section: row.target_section,
    },
    lang,
    offering,
  )
  return `${target} · ${formatDate(row.created_at, lang)}`
}

/** Badges, content, image, link, Edit and Delete. The caller renders the title. */
export function NoticeDetail({ notice, lang }: { notice: Notice; lang: Lang }) {
  const { row } = notice
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${kindBadgeClass(row.kind)}`}>
          {kindLabel(row.kind, lang)}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${importanceBadgeClass(row.importance)}`}>
          {importanceLabel(row.importance, lang)}
        </span>
        {isUnpublished(row.unpublished_at) && (
          <span className="rounded-full bg-paper-muted px-2 py-0.5 text-xs font-semibold text-muted">
            {t('notices.unpublishedChip', lang)}
          </span>
        )}
        {row.kind === 'homework' && row.due_at && (
          <span className="text-xs text-muted">
            {t('student.taskDue', lang)}: {formatDate(row.due_at, lang)}
          </span>
        )}
      </div>
      {row.content && <Markdown text={row.content} className="mb-4 max-w-prose" />}
      {row.image_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/publication-image?id=${row.id}`} alt="" className="mb-4 max-w-full rounded-md border border-line" />
      )}
      {row.link_url && (
        <p className="mb-4 text-sm">
          <a href={row.link_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
            {row.link_url}
          </a>
        </p>
      )}
      <PublicationActions id={row.id} kind={row.kind} unpublishedAt={row.unpublished_at} lang={lang} />
    </>
  )
}
