'use client'

import { useMemo, useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { EDUCATION_LEVELS } from '@/lib/institute'
import type { LocationRow } from '@/lib/locations'
import { updateInstituteProfile } from './actions'

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
}: {
  lang: Lang
  isOwner: boolean
  school: SchoolRow
  locations: LocationRow[]
  clusters: { id: string; name: string }[]
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
