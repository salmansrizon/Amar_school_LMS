'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { t, type Lang } from '@/lib/i18n'
import { EDUCATION_LEVELS } from '@/lib/institute'
import { logoImageExtension, LOGO_MAX_BYTES } from '@/lib/institute-print'
import type { LocationRow } from '@/lib/locations'
import { PRINT_THEMES, DEFAULT_THEME_KEY } from '@/lib/print-themes'
import {
  recordSchoolLogo,
  removeSchoolLogo,
  savePrintTheme,
  schoolLogoUploadPath,
  updateInstituteProfile,
} from './actions'

type SchoolRow = {
  id: string
  name: string
  institute_code: string | null
  eiin_no: string | null
  mpo_enlisted: boolean
  mpo_code: string | null
  center_code: string | null
  education_levels: string[]
  location_id: string | null
  cluster_id: string | null
  address_line: string | null
  mobile: string | null
  email: string | null
  logo_path: string | null
} | null

const selectClass = inputClass

/** Walk parent_id up from `id` to the root, returning [division, district, upazila, union]
 *  ids at whichever levels are actually set (shorter than 4 when the chain stops early). */
function ancestorChain(locations: LocationRow[], id: string | null): string[] {
  if (!id) return []
  const byId = new Map(locations.map((l) => [l.id, l]))
  const chain: LocationRow[] = []
  let cur = byId.get(id)
  while (cur) {
    chain.unshift(cur)
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
  }
  return chain.map((l) => l.id)
}

export function ProfileForm({
  lang,
  isOwner,
  school,
  locations,
  clusters,
  admitCardTheme,
}: {
  lang: Lang
  isOwner: boolean
  school: SchoolRow
  locations: LocationRow[]
  clusters: { id: string; name: string }[]
  admitCardTheme: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const initialChain = useMemo(() => ancestorChain(locations, school?.location_id ?? null), [locations, school])
  const [divisionId, setDivisionId] = useState(initialChain[0] ?? '')
  const [districtId, setDistrictId] = useState(initialChain[1] ?? '')
  const [upazilaId, setUpazilaId] = useState(initialChain[2] ?? '')
  const [unionId, setUnionId] = useState(initialChain[3] ?? '')

  const divisions = locations.filter((l) => l.type === 'division')
  const districts = locations.filter((l) => l.type === 'district' && l.parent_id === divisionId)
  const upazilas = locations.filter((l) => l.type === 'upazila' && l.parent_id === districtId)
  const unions = locations.filter((l) => l.type === 'union' && l.parent_id === upazilaId)

  // Deepest level the owner picked wins — a School isn't required to resolve
  // all the way down to Union.
  const finalLocationId = unionId || upazilaId || districtId || divisionId || ''

  // Known domain-validation codes translate; anything else (RLS/Postgres
  // errors) is shown as-is rather than risking an unknown-key lookup.
  const ERROR_KEYS = {
    nameRequired: 'institute.errNameRequired',
    mpoCodeRequired: 'institute.errMpoCodeRequired',
    eiinInvalid: 'institute.errEiinInvalid',
    educationLevelInvalid: 'institute.errEducationLevelInvalid',
    emailInvalid: 'institute.errEmailInvalid',
    logoBadType: 'institute.errLogoBadType',
  } as const
  const errorMessage = (code: string) =>
    code in ERROR_KEYS ? t(ERROR_KEYS[code as keyof typeof ERROR_KEYS], lang) : code

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    data.set('location_id', finalLocationId)
    startTransition(async () => {
      setError(null)
      setSaved(false)
      const result = await updateInstituteProfile(data)
      if (result.error) setError(errorMessage(result.error))
      else setSaved(true)
    })
  }

  if (!school) return <p className="text-sm text-muted">—</p>

  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={!isOwner || pending} className="contents">
        {!isOwner && (
          <p className="mb-4 rounded-md border border-line bg-paper-muted p-3 text-sm text-muted">
            {t('institute.ownerOnly', lang)}
          </p>
        )}

        <div className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
          <h3 className="mb-3 font-bold">{t('institute.basicInfo', lang)}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="name">
                {t('institute.name', lang)}
              </label>
              <input id="name" name="name" defaultValue={school.name} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="institute_code">
                {t('institute.instituteCode', lang)}
              </label>
              <input
                id="institute_code"
                name="institute_code"
                defaultValue={school.institute_code ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="eiin_no">
                {t('institute.eiinNo', lang)}
              </label>
              <input id="eiin_no" name="eiin_no" defaultValue={school.eiin_no ?? ''} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="mpo_enlisted">
                {t('institute.mpoEnlisted', lang)}
              </label>
              <select
                id="mpo_enlisted"
                name="mpo_enlisted"
                defaultValue={String(school.mpo_enlisted)}
                className={selectClass}
              >
                <option value="true">{t('institute.yes', lang)}</option>
                <option value="false">{t('institute.no', lang)}</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="mpo_code">
                {t('institute.mpoCode', lang)}
              </label>
              <input id="mpo_code" name="mpo_code" defaultValue={school.mpo_code ?? ''} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="center_code">
                {t('institute.centerCode', lang)}
              </label>
              <input
                id="center_code"
                name="center_code"
                defaultValue={school.center_code ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="cluster_id">
                {t('institute.cluster', lang)}
              </label>
              <select id="cluster_id" name="cluster_id" defaultValue={school.cluster_id ?? ''} className={selectClass}>
                <option value="">{t('institute.clusterNone', lang)}</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Print header (issue #92): these three lines plus the logo are what
            every printable shows at the top. Address is free text on purpose —
            the location hierarchy below has no street line. */}
        <div className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
          <h3 className="mb-1 font-bold">{t('institute.printHeader', lang)}</h3>
          <p className="mb-3 text-xs text-muted">{t('institute.printHeaderHint', lang)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="address_line">
                {t('institute.addressLine', lang)}
              </label>
              <input
                id="address_line"
                name="address_line"
                defaultValue={school.address_line ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="mobile">
                {t('institute.mobile', lang)}
              </label>
              <input id="mobile" name="mobile" defaultValue={school.mobile ?? ''} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="email">
                {t('institute.email', lang)}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={school.email ?? ''}
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-4">
            <span className={labelClass}>{t('institute.logo', lang)}</span>
            <LogoControl lang={lang} isOwner={isOwner} hasLogo={!!school.logo_path} />
          </div>
          <div className="mt-4">
            <ThemeControl lang={lang} isOwner={isOwner} selected={admitCardTheme ?? DEFAULT_THEME_KEY} />
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
          <h3 className="mb-3 font-bold">{t('institute.address', lang)}</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className={labelClass}>{t('institute.division', lang)}</label>
              <select
                className={selectClass}
                value={divisionId}
                onChange={(e) => {
                  setDivisionId(e.target.value)
                  setDistrictId('')
                  setUpazilaId('')
                  setUnionId('')
                }}
              >
                <option value="">{t('institute.selectOne', lang)}</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('institute.district', lang)}</label>
              <select
                className={selectClass}
                value={districtId}
                disabled={!divisionId}
                onChange={(e) => {
                  setDistrictId(e.target.value)
                  setUpazilaId('')
                  setUnionId('')
                }}
              >
                <option value="">{t('institute.selectOne', lang)}</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('institute.upazila', lang)}</label>
              <select
                className={selectClass}
                value={upazilaId}
                disabled={!districtId}
                onChange={(e) => {
                  setUpazilaId(e.target.value)
                  setUnionId('')
                }}
              >
                <option value="">{t('institute.selectOne', lang)}</option>
                {upazilas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('institute.union', lang)}</label>
              <select
                className={selectClass}
                value={unionId}
                disabled={!upazilaId}
                onChange={(e) => setUnionId(e.target.value)}
              >
                <option value="">{t('institute.selectOne', lang)}</option>
                {unions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-line bg-paper p-5 shadow-card">
          <h3 className="mb-3 font-bold">{t('institute.educationLevels', lang)}</h3>
          <div className="flex flex-wrap gap-4">
            {EDUCATION_LEVELS.map((lvl) => (
              <label key={lvl.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="education_levels"
                  value={lvl.key}
                  defaultChecked={school.education_levels.includes(lvl.key)}
                />
                {lvl.label[lang]}
              </label>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-alert-deep">{error}</p>}
          {saved && !error && <p className="mt-3 text-sm text-mint-deep">{t('institute.saved', lang)}</p>}
          {isOwner && (
            <button type="submit" disabled={pending} className={`${primaryBtnClass} mt-4 w-auto px-6`}>
              {t('institute.save', lang)}
            </button>
          )}
        </div>
      </fieldset>
    </form>
  )
}

/** Logo upload (issue #92): bytes go client-direct to the private
 *  'school-logos' bucket (the syllabus/gallery pattern), the server action
 *  only records the path. Saved immediately — not on form submit — so the
 *  preview below always reflects what will print. */
function LogoControl({ lang, isOwner, hasLogo }: { lang: Lang; isOwner: boolean; hasLogo: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cache-busts the <img> after a replace, since the URL never changes.
  const [version, setVersion] = useState(0)
  const [present, setPresent] = useState(hasLogo)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (!logoImageExtension(file.type)) {
      setError(t('institute.errLogoBadType', lang))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError(t('institute.errLogoTooBig', lang))
      return
    }
    setBusy(true)
    const { path, error: pathErr } = await schoolLogoUploadPath(file.type)
    if (pathErr || !path) {
      setError(pathErr ?? 'Upload failed')
      setBusy(false)
      return
    }
    const supabase = createSupabaseClient()
    const { error: upErr } = await supabase.storage
      .from('school-logos')
      .upload(path, file, { contentType: file.type, upsert: true })
    if (upErr) {
      setError(upErr.message)
      setBusy(false)
      return
    }
    const res = await recordSchoolLogo(path)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    if (res.error) {
      // Row update failed — drop the orphaned object rather than leave it.
      await supabase.storage.from('school-logos').remove([path])
      setError(res.error)
      return
    }
    setPresent(true)
    setVersion((v) => v + 1)
    router.refresh()
  }

  async function onRemove() {
    setError(null)
    setBusy(true)
    const res = await removeSchoolLogo()
    setBusy(false)
    if (res.error) setError(res.error)
    else {
      setPresent(false)
      router.refresh()
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-3">
      {present ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/school-logo?v=${version}`}
          alt={t('institute.logo', lang)}
          className="h-16 w-16 rounded-md border border-line object-contain"
        />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-line text-xs text-muted">
          —
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
      />
      {isOwner && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? t('institute.logoUploading', lang) : t('institute.logoUpload', lang)}
          </button>
          {present && (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold text-alert-deep disabled:opacity-50"
            >
              {t('institute.logoRemove', lang)}
            </button>
          )}
        </>
      )}
      <span className="text-xs text-muted">{t('institute.logoHint', lang)}</span>
      {error && <p className="w-full text-sm text-alert-deep">{error}</p>}
    </div>
  )
}

/** The school's default admit-card palette (issue #94). Colour is deliberately
 *  admit-card-only — mark sheets and result books stay monochrome — but the
 *  saved value is keyed by document type, so adding another themed printable
 *  later is a new row rather than a schema change. */
function ThemeControl({ lang, isOwner, selected }: { lang: Lang; isOwner: boolean; selected: string }) {
  const router = useRouter()
  const [value, setValue] = useState(selected)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div>
      <label className={labelClass} htmlFor="admit_card_theme">
        {t('admitCard.theme', lang)}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id="admit_card_theme"
          value={value}
          disabled={!isOwner || pending}
          onChange={(e) => {
            const next = e.target.value
            setValue(next)
            startTransition(async () => {
              setError(null)
              const res = await savePrintTheme('admit-card', next)
              if (res.error) setError(res.error)
              else router.refresh()
            })
          }}
          className={`${inputClass} max-w-56`}
        >
          {PRINT_THEMES.map((theme) => (
            <option key={theme.key} value={theme.key}>
              {theme.label[lang]}
            </option>
          ))}
        </select>
        {/* Swatch: the preset as it will actually print. */}
        {PRINT_THEMES.filter((theme) => theme.key === value).map((theme) => (
          <span
            key={theme.key}
            style={{ background: theme.paper, color: theme.ink, borderColor: theme.accent }}
            className="rounded-md border-2 px-3 py-1 text-xs font-semibold"
          >
            {theme.label[lang]}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">{t('admitCard.themeHint', lang)}</p>
      {error && <p className="mt-1 text-sm text-alert-deep">{error}</p>}
    </div>
  )
}
