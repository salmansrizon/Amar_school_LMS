'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { t, type Lang } from '@/lib/i18n'
import { deletePublication } from '../actions'

const pillClass = 'cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50'

/** Edit and Delete for one publication. Delete asks in the app's own dialog,
 *  then leaves for the list with a toast — staying put rendered the deleted
 *  row's URL, which is a 404. */
export function PublicationActions({ id, lang }: { id: string; lang: Lang }) {
  const router = useRouter()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/school/notices/${id}/edit`} className={`${pillClass} border border-line-strong hover:bg-paper-muted`}>
        {t('fees.edit', lang)}
      </Link>
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
