import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { resolveClassSection } from '@/lib/class-catalogue'
import { Card, PageHeader } from '@/components/ui/page'
import { classLoginCandidates } from '../login-actions'
import { BulkLoginControls } from './bulk-controls'

// Class-at-a-time login issue (#442). No owner provisions a 40-child roster one
// student at a time, so this is the bulk surface: pick a class, see exactly who
// would get a login, then commit. Idempotent — students who already have one are
// never in the list, so re-running after an admission only fills the gap.

export default async function StudentLoginsPage({
  searchParams,
}: {
  searchParams: Promise<{ classSection?: string }>
}) {
  const { classSection = '' } = await searchParams
  const lang: Lang = await currentLang()
  const { supabase, role } = await getSchoolContext()
  // Issuing a child's password is an owner act, not a Staff-User one — the RPCs
  // reject Staff anyway, this just avoids showing them a screen that cannot work.
  if (role !== 'school_owner') redirect('/school/students')

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, section, group_department')
    .order('created_at')
  const { combos, className, section } = resolveClassSection(classes ?? [], classSection)
  const { students } = className
    ? await classLoginCandidates(className, section)
    : { students: [] }

  return (
    <>
      <PageHeader
        title={t('students.loginBulkTitle', lang)}
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
            <select
              name="classSection"
              defaultValue={classSection}
              className="rounded-md border border-line-strong bg-paper px-3 py-1.5 text-sm"
            >
              <option value="">—</option>
              {combos.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('students.loginBulkPreview', lang)}
          </button>
        </form>

        {className && (
          <BulkLoginControls
            lang={lang}
            klass={className}
            section={section}
            candidates={students}
          />
        )}
      </Card>
    </>
  )
}
