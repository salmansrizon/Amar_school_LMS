'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { compressImage, IMAGE_PRESETS } from '@/lib/image/compress'
import {
  IMPORTANCE_LEVELS,
  PUBLICATION_KINDS,
  PUBLICATION_MAX_IMAGE_BYTES,
  type Importance,
  type PublicationKind,
  type TargetType,
} from '@/lib/publishing'
import { createPublication, publicationImageUploadPath } from '../actions'

const textareaClass =
  'w-full rounded-sm border border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-brand-500'

export function CreateNoticeForm({
  lang,
  classNames,
  sections,
}: {
  lang: Lang
  classNames: string[]
  sections: string[]
}) {
  const router = useRouter()
  const [kind, setKind] = useState<PublicationKind>('notice')
  const [importance, setImportance] = useState<Importance>('normal')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [targetClassName, setTargetClassName] = useState('')
  const [targetSection, setTargetSection] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(t('notices.titleRequired', lang))
      return
    }
    startTransition(async () => {
      setError(null)
      const supabase = createClient()
      let imagePath: string | null = null
      if (imageFile) {
        // Compress before the size check so large images fit the 2 MB bucket cap.
        const image = await compressImage(imageFile, IMAGE_PRESETS.publication)
        if (image.size > PUBLICATION_MAX_IMAGE_BYTES) {
          setError(t('notices.imageTooBig', lang))
          return
        }
        const { path, error: pathErr } = await publicationImageUploadPath(image.type)
        if (pathErr || !path) {
          setError(pathErr ?? 'Upload failed')
          return
        }
        const { error: upErr } = await supabase.storage
          .from('publications')
          .upload(path, image, { contentType: image.type })
        if (upErr) {
          setError(upErr.message)
          return
        }
        imagePath = path
      }
      const res = await createPublication({
        kind,
        title,
        content,
        importance,
        targetType,
        targetClassName,
        targetSection,
        imagePath,
        linkUrl,
      })
      if (res.error) {
        // The row insert failed after the image was already uploaded — clean
        // up the now-orphaned object rather than leaving it unreferenced
        // (mirrors the gallery upload flow's cleanup-on-failure).
        if (imagePath) await supabase.storage.from('publications').remove([imagePath])
        setError(res.error)
        return
      }
      router.push('/school/notices')
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-line bg-paper p-5 shadow-card">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <div>
          <label className={labelClass}>{t('notices.type', lang)}</label>
          <select
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as PublicationKind)}
          >
            {PUBLICATION_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label[lang]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t('notices.importance', lang)}</label>
          <select
            className={inputClass}
            value={importance}
            onChange={(e) => setImportance(e.target.value as Importance)}
          >
            {IMPORTANCE_LEVELS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label[lang]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>{t('notices.colTitle', lang)}</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={labelClass}>{t('notices.colTarget', lang)}</label>
          <select
            className={inputClass}
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TargetType)}
          >
            <option value="all">{t('notices.targetAll', lang)}</option>
            <option value="specific">{t('notices.targetSpecific', lang)}</option>
          </select>
        </div>
        <div />
        {targetType === 'specific' && (
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
            <div>
              <label className={labelClass}>{t('classes.class', lang)}</label>
              <select
                className={inputClass}
                value={targetClassName}
                onChange={(e) => setTargetClassName(e.target.value)}
              >
                <option value="">—</option>
                {classNames.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('classes.section', lang)}</label>
              <select
                className={inputClass}
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value)}
              >
                <option value="">—</option>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={labelClass}>{t('notices.content', lang)}</label>
          <textarea
            rows={5}
            className={textareaClass}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>{t('notices.image', lang)}</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <label className={labelClass}>{t('notices.link', lang)}</label>
          <input
            className={inputClass}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://"
          />
        </div>
        {error && <p className="text-sm text-alert-deep sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={pending} className={`${primaryBtnClass} w-auto px-6`}>
            {pending ? t('notices.publishing', lang) : t('notices.publish', lang)}
          </button>
        </div>
      </form>
    </div>
  )
}
