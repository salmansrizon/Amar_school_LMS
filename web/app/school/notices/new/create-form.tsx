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
import { ComboboxField } from '@/components/ui/combobox-field'
import { SelectField } from '@/components/ui/select-field'
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
          <label htmlFor="notice_kind" className={labelClass}>{t('notices.type', lang)}</label>
          <SelectField
            id="notice_kind"
            value={kind}
            onValueChange={(v) => setKind(v as PublicationKind)}
            options={PUBLICATION_KINDS.map((k) => ({ value: k.key, label: k.label[lang] }))}
          />
        </div>
        <div>
          <label htmlFor="notice_importance" className={labelClass}>{t('notices.importance', lang)}</label>
          <SelectField
            id="notice_importance"
            value={importance}
            onValueChange={(v) => setImportance(v as Importance)}
            options={IMPORTANCE_LEVELS.map((i) => ({ value: i.key, label: i.label[lang] }))}
          />
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
          <label htmlFor="notice_target_scope" className={labelClass}>{t('notices.colTarget', lang)}</label>
          <SelectField
            id="notice_target_scope"
            value={targetScope}
            onValueChange={(v) => chooseScope(v as TargetScope)}
            options={[
              { value: 'all', label: t('notices.targetAll', lang) },
              { value: 'offering', label: t('notices.targetOffering', lang) },
              { value: 'broadcast', label: t('notices.targetBroadcast', lang) },
            ]}
          />
        </div>
        <div />
        {targetScope === 'offering' && (
          <div className="sm:col-span-2">
            <label htmlFor="notice_offering" className={labelClass}>{t('notices.classOffering', lang)}</label>
            <ComboboxField
              id="notice_offering"
              value={offeringId}
              onValueChange={setOfferingId}
              options={[
                { value: '', label: t('notices.selectOffering', lang) },
                ...offeringOptions.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />
          </div>
        )}
        {targetScope === 'broadcast' && (
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <div>
              <label htmlFor="notice_target_class_name" className={labelClass}>{t('classes.class', lang)}</label>
              <ComboboxField
                id="notice_target_class_name"
                value={targetClassName}
                onValueChange={setTargetClassName}
                options={[
                  { value: '', label: t('notices.selectClass', lang) },
                  ...classNameOptions.map((c) => ({ value: c, label: c })),
                ]}
              />
            </div>
            <div>
              <label htmlFor="notice_target_shift" className={labelClass}>{t('sms.shift', lang)}</label>
              <ComboboxField
                id="notice_target_shift"
                value={targetShift}
                onValueChange={setTargetShift}
                options={[
                  { value: '', label: t('sms.anyShift', lang) },
                  ...shiftOptions.map((s) => ({ value: s, label: s })),
                ]}
              />
            </div>
            <div>
              <label htmlFor="notice_target_group_department" className={labelClass}>{t('sms.groupDepartment', lang)}</label>
              <ComboboxField
                id="notice_target_group_department"
                value={targetGroupDepartment}
                onValueChange={setTargetGroupDepartment}
                options={[
                  { value: '', label: t('sms.anyGroup', lang) },
                  ...groupOptions.map((g) => ({ value: g, label: g })),
                ]}
              />
            </div>
            <div>
              <label htmlFor="notice_target_section" className={labelClass}>{t('classes.section', lang)}</label>
              <ComboboxField
                id="notice_target_section"
                value={targetSection}
                onValueChange={setTargetSection}
                options={[
                  { value: '', label: t('sms.anySection', lang) },
                  ...sectionOptions.map((s) => ({ value: s, label: s })),
                ]}
              />
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
