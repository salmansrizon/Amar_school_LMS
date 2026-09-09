'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { compressImage, IMAGE_PRESETS } from '@/lib/image/compress'
import {
  IMPORTANCE_LEVELS,
  PUBLICATION_KINDS,
  PUBLICATION_MAX_IMAGE_BYTES,
  validateTargetSelection,
  TARGET_SELECTION_ERROR_KEY,
  type Importance,
  type PublicationKind,
  type TargetScope,
} from '@/lib/publishing'
import { classCatalogueOptions, type ClassCatalogueRow } from '@/lib/class-catalogue'
import { createPublication, publicationImageUploadTicket } from '../actions'
import { selectClass } from '@/components/ui/field'
import { removeUploadedObject } from '@/lib/storage/remove-object'
import { uploadWithSignedToken } from '@/lib/storage/upload-client'

const textareaClass =
  'w-full rounded-sm border border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-brand-500'

function distinct(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort()
}

export function CreateNoticeForm({
  lang,
  offerings,
  activeAcademicYear,
}: {
  lang: Lang
  offerings: ClassCatalogueRow[]
  activeAcademicYear: number | null
}) {
  const router = useRouter()
  const [kind, setKind] = useState<PublicationKind>('notice')
  const [importance, setImportance] = useState<Importance>('normal')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // Targeting onto map #598's three-scope contract (#607): All / exact Class
  // Offering / broadcast predicate (Class + Any-or-specific Shift/Group/
  // Section, Year pinned to the School's active Academic Year).
  const [targetScope, setTargetScope] = useState<TargetScope>('all')
  const [offeringId, setOfferingId] = useState('')
  const [targetClassName, setTargetClassName] = useState('')
  const [targetShift, setTargetShift] = useState('')
  const [targetGroupDepartment, setTargetGroupDepartment] = useState('')
  const [targetSection, setTargetSection] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const offeringOptions = useMemo(() => classCatalogueOptions(offerings), [offerings])
  const classNameOptions = useMemo(() => distinct(offerings.map((o) => o.name)), [offerings])
  const shiftOptions = useMemo(() => distinct(offerings.map((o) => o.shift)), [offerings])
  const groupOptions = useMemo(() => distinct(offerings.map((o) => o.group_department)), [offerings])
  const sectionOptions = useMemo(() => distinct(offerings.map((o) => o.section)), [offerings])

  function chooseScope(scope: TargetScope) {
    setError(null)
    setTargetScope(scope)
    // A broadcast MUST name a Class (#600) -- seed it with the first option so
    // the target is never left incomplete.
    if (scope === 'broadcast' && !targetClassName) {
      setTargetClassName(classNameOptions[0] ?? '')
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError(t('notices.titleRequired', lang))
      return
    }
    const targetError = validateTargetSelection({
      scope: targetScope,
      classOfferingId: offeringId,
      className: targetClassName,
      academicYear: activeAcademicYear,
      shift: targetShift,
      groupDepartment: targetGroupDepartment,
      section: targetSection,
    })
    if (targetError) {
      setError(t(TARGET_SELECTION_ERROR_KEY[targetError], lang))
      return
    }
    startTransition(async () => {
      setError(null)
      let imagePath: string | null = null
      if (imageFile) {
        // Compress before the size check so large images fit the 2 MB bucket cap.
        const image = await compressImage(imageFile, IMAGE_PRESETS.publication)
        if (image.size > PUBLICATION_MAX_IMAGE_BYTES) {
          setError(t('notices.imageTooBig', lang))
          return
        }
        const { upload, error: pathErr } = await publicationImageUploadTicket(image.type)
        if (pathErr || !upload) {
          setError(pathErr ?? 'Upload failed')
          return
        }
        const { error: upErr } = await uploadWithSignedToken('publications', upload, image, image.type)
        if (upErr) {
          setError(upErr)
          return
        }
        imagePath = upload.path
      }
      const res = await createPublication({
        kind,
        title,
        content,
        importance,
        targetScope,
        classOfferingId: offeringId,
        targetClassName,
        targetShift,
        targetGroupDepartment,
        targetSection,
        imagePath,
        linkUrl,
      })
      if (res.error) {
        // The row insert failed after the image was already uploaded — clean
        // up the now-orphaned object rather than leaving it unreferenced
        // (mirrors the gallery upload flow's cleanup-on-failure).
        if (imagePath) await removeUploadedObject('publications', imagePath)
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
            className={selectClass({ size: 'md', fullWidth: true })}
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
            className={selectClass({ size: 'md', fullWidth: true })}
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
            className={selectClass({ size: 'md', fullWidth: true })}
            value={targetScope}
            onChange={(e) => chooseScope(e.target.value as TargetScope)}
          >
            <option value="all">{t('notices.targetAll', lang)}</option>
            <option value="offering">{t('notices.targetOffering', lang)}</option>
            <option value="broadcast">{t('notices.targetBroadcast', lang)}</option>
          </select>
        </div>
        <div />
        {targetScope === 'offering' && (
          <div className="sm:col-span-2">
            <label className={labelClass}>{t('notices.classOffering', lang)}</label>
            <select
              className={selectClass({ size: 'md', fullWidth: true })}
              value={offeringId}
              onChange={(e) => setOfferingId(e.target.value)}
            >
              <option value="">{t('notices.selectOffering', lang)}</option>
              {offeringOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {targetScope === 'broadcast' && (
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t('classes.class', lang)}</label>
              <select
                className={selectClass({ size: 'md', fullWidth: true })}
                value={targetClassName}
                onChange={(e) => setTargetClassName(e.target.value)}
              >
                <option value="">{t('notices.selectClass', lang)}</option>
                {classNameOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('sms.shift', lang)}</label>
              <select
                className={selectClass({ size: 'md', fullWidth: true })}
                value={targetShift}
                onChange={(e) => setTargetShift(e.target.value)}
              >
                <option value="">{t('sms.anyShift', lang)}</option>
                {shiftOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('sms.groupDepartment', lang)}</label>
              <select
                className={selectClass({ size: 'md', fullWidth: true })}
                value={targetGroupDepartment}
                onChange={(e) => setTargetGroupDepartment(e.target.value)}
              >
                <option value="">{t('sms.anyGroup', lang)}</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('classes.section', lang)}</label>
              <select
                className={selectClass({ size: 'md', fullWidth: true })}
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value)}
              >
                <option value="">{t('sms.anySection', lang)}</option>
                {sectionOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted sm:col-span-2">
              {t('sms.academicYearPinned', lang)}: {activeAcademicYear ?? '—'}
            </p>
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
