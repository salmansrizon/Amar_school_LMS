'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { t, type Lang } from '@/lib/i18n'
import { publishToggle, type UnpublishedAt } from '@/lib/school/publication-status'
import { deletePublication, setNoticePublished } from '../actions'

const pillClass = 'cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50'

/** Edit and Delete for one publication. Delete asks in the app's own dialog,
 *  then leaves for the list with a toast — staying put rendered the deleted
 *  row's URL, which is a 404. */
export function PublicationActions({
  id,
  kind,
  unpublishedAt,
  lang,
}: {
  id: string
  kind: string
  unpublishedAt: UnpublishedAt
  lang: Lang
}) {
  const router = useRouter()
  // #696: notices only, and only once migration 0252 has added the column.
  const toggle = publishToggle(kind, unpublishedAt)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/school/notices/${id}/edit`} className={`${pillClass} border border-line-strong hover:bg-paper-muted`}>
        {t('fees.edit', lang)}
      </Link>
      {toggle === 'unpublish' && (
        <ConfirmDialog
          triggerLabel={t('notices.unpublish', lang)}
          triggerClassName={`${pillClass} border border-line-strong hover:bg-paper-muted`}
          title={t('notices.confirmUnpublish', lang)}
          confirmLabel={t('notices.unpublish', lang)}
          cancelLabel={t('routine.cancel', lang)}
          confirmTone="brand"
          onConfirm={async () => {
            const res = await setNoticePublished(id, false)
            if (res.error) return res
            toast.success(t('notices.unpublished', lang))
            router.refresh()
          }}
        />
      )}
      {toggle === 'republish' && (
        <button
          type="button"
          className={`${pillClass} border border-line-strong hover:bg-paper-muted`}
          onClick={async () => {
            const res = await setNoticePublished(id, true)
            if (res.error) toast.error(res.error)
            else {
              toast.success(t('notices.republished', lang))
              router.refresh()
            }
          }}
        >
          {t('notices.republish', lang)}
        </button>
      )}
      <ConfirmDialog
        triggerLabel={t('common.delete', lang)}
        triggerClassName={`${pillClass} bg-alert-soft text-alert-deep`}
        title={t('notices.confirmDelete', lang)}
        confirmLabel={t('common.delete', lang)}
        cancelLabel={t('routine.cancel', lang)}
        onConfirm={async () => {
          const res = await deletePublication(id)
          if (res.error) return res
          toast.success(t('notices.deleted', lang))
          router.push('/school/notices')
        }}
      />
    </div>
  )
}
