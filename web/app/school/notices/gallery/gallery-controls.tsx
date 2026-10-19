'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { createAlbum, deleteAlbum } from './actions'

export function CreateAlbumForm({ lang }: { lang: Lang }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const res = await createAlbum(data)
          if (res.error) setError(res.error)
          else {
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      <div>
        <label className={labelClass}>{t('gallery.albumTitle', lang)}</label>
        <input name="title" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t('gallery.maxImages', lang)}</label>
        <input name="max_images" type="number" min={1} max={500} defaultValue={20} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t('gallery.maxImageSizeMb', lang)}</label>
        <input
          name="max_image_size_mb"
          type="number"
          min={0.1}
          step={0.1}
          max={20}
          defaultValue={1}
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-alert-deep sm:col-span-3">{error}</p>}
      <button type="submit" disabled={pending} className={`${primaryBtnClass} sm:col-span-3`}>
        {t('gallery.createAlbum', lang)}
      </button>
    </form>
  )
}

export function DeleteAlbumButton({ albumId, lang }: { albumId: string; lang: Lang }) {
  const router = useRouter()

  // The app's own dialog, then back to the album list with a toast — staying
  // on the deleted album's URL rendered a 404.
  return (
    <ConfirmDialog
      triggerLabel={t('gallery.deleteAlbum', lang)}
      triggerClassName="cursor-pointer rounded-full bg-alert-soft px-4 py-1.5 text-xs font-semibold text-alert-deep disabled:opacity-50"
      title={t('gallery.confirmDeleteAlbum', lang)}
      confirmLabel={t('gallery.deleteAlbum', lang)}
      cancelLabel={t('routine.cancel', lang)}
      onConfirm={async () => {
        const res = await deleteAlbum(albumId)
        if (res.error) return res
        toast.success(t('gallery.albumDeleted', lang))
        router.push('/school/notices/gallery')
      }}
    />
  )
}
