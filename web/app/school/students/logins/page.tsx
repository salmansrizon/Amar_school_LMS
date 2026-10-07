import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { applyGlobalYearFilterToOfferings } from '@/lib/school/year-filter'
import { classCatalogueOptions } from '@/lib/class-catalogue'
import { Card, PageHeader } from '@/components/ui/page'
import { ComboboxField } from '@/components/ui/combobox-field'
import { classLoginCandidates } from '../login-actions'
import { BulkLoginControls } from './bulk-controls'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { pageTitle } from '@/lib/page-title'

// Class-at-a-time login issue (#442). No owner provisions a 40-child roster one
// student at a time, so this is the bulk surface: pick a class, see exactly who
// would get a login, then commit. Idempotent — students who already have one are
// never in the list, so re-running after an admission only fills the gap.

export const generateMetadata = pageTitle('students.loginBulkTitle')

export default async function StudentLoginsPage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string }>
}) {
  const { classSection = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, role, shiftSelection, startedAcademicYears, academicYearSelection } = await getSchoolContext()
  // Issuing a child's password is an owner act, not a Staff-User one — the RPCs
  // reject Staff anyway, this just avoids showing them a screen that cannot work.
  if (role !== 'school_owner') redirect('/school/students')

  const { data: classes } = await applyGlobalYearFilterToOfferings(
    applyGlobalShiftFilterToOfferings(
      supabase
        .from('class_offerings')
        .select('id, name, section, group_department, shift, academic_year')
        .order('created_at'),
      shiftSelection,
    ),
    academicYearSelection,
  )
  // Started-year history is the signal (#609/#612), same boolean T6/#615
  // threaded into the Fee Structures Offering picker.
  const showYear = startedAcademicYears.length > 1
  // `classSection` IS the picked Class Offering's id (the option value). It is
  // passed straight through to roster resolution — never collapsed to a
  // class_name/section text pair, which since #593 can match two Offerings
  // (issue #596). Combos are for rendering the picker only.
  const combos = classCatalogueOptions(classes ?? [], showYear)
  const selectedOfferingId = combos.some((c) => c.value === classSection) ? classSection : ''
  const { students } = selectedOfferingId
    ? await classLoginCandidates(selectedOfferingId)
    : { students: [] }

  return (
    <>
      <PageHeader
        title={t('students.loginBulkTitle', lang)}
        crumbs={schoolCrumbs('/school/students', lang, { label: t('students.listTitle', lang), href: '/school/students' }, { label: t('students.loginBulkTitle', lang) })}
        actions={
          <Link
            href="/school/students"
            className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('students.listTitle', lang)}
          </Link>
        }
      />

      <Card>
        <p className="mb-4 text-sm text-muted">{t('students.loginBulkIntro', lang)}</p>

        {/* Plain GET form — the picker needs no JavaScript to work. */}
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-muted">
            <span className="mb-1 block">{t('students.classSection', lang)}</span>
            <ComboboxField
              name="classSection"
              defaultValue={classSection}
              options={[{ value: '', label: '—' }, ...combos.map((c) => ({ value: c.value, label: c.label }))]}
            />
          </label>
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('students.loginBulkPreview', lang)}
          </button>
        </form>

        {selectedOfferingId && (
          <BulkLoginControls
            lang={lang}
            classOfferingId={selectedOfferingId}
            candidates={students}
          />
        )}
      </Card>
    </>
  )
}
