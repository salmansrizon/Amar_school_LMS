import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { formatBytes } from '@/lib/routine'
import { SyllabusRow } from './syllabus-controls'
import { classCatalogueLabel } from '@/lib/class-catalogue'
import { schoolCrumbs } from '@/lib/school-crumbs'
import { PageHeader } from '@/components/ui/page'

// Layout per ui/school-owner/syllabus-upload.html: the "Existing Syllabus
// Files" table (Class | Current File | Uploaded On | Size | Actions), one row
// per class, upload/replace inline. The mockup's separate top upload form is
// redundant with the per-row Upload buttons and is deliberately skipped, as is
// its per-subject option — the schema (and ticket) are one syllabus per class.

const thClass = 'whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-muted'

export default async function SyllabusPage() {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection } = await getSchoolContext()

  const [{ data: classes }, { data: syllabi }] = await Promise.all([
    applyGlobalShiftFilterToOfferings(
      supabase.from('class_offerings').select('id, name, section, group_department, shift').order('created_at'),
      shiftSelection,
    ),
    supabase.from('class_syllabi').select('class_id, file_name, uploaded_at, file_size'),
  ])

  const byClass = new Map((syllabi ?? []).map((s) => [s.class_id, s]))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <>
      <PageHeader
        title={t('syllabus.title', lang)}
        backHref="/school/classes"
        backLabel={t('classes.title', lang)}
        crumbs={schoolCrumbs('/school/classes', lang, { label: t('classes.title', lang), href: '/school/classes' }, { label: t('syllabus.title', lang) })}
      />
      <p className="mb-4 text-sm text-muted">{t('syllabus.intro', lang)}</p>

      <section className="overflow-hidden rounded-2xl border border-line bg-paper">
        <h2 className="px-card py-4 font-bold">{t('syllabus.existing', lang)}</h2>
        {!classes?.length ? (
          <p className="px-card pb-4 text-sm text-muted">{t('syllabus.noClasses', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-paper-muted">
                <tr>
                  <th className={thClass}>{t('classes.class', lang)}</th>
                  <th className={thClass}>{t('syllabus.currentFile', lang)}</th>
                  <th className={thClass}>{t('syllabus.uploadedOn', lang)}</th>
                  <th className={thClass}>{t('syllabus.size', lang)}</th>
                  <th className={thClass}>{t('classes.actions', lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {classes.map((c) => {
                  const s = byClass.get(c.id)
                  return (
                    <SyllabusRow
                      key={c.id}
                      classId={c.id}
                      classLabel={classCatalogueLabel(c)}
                      fileName={s?.file_name ?? null}
                      uploadedOn={
                        s?.uploaded_at ? new Date(s.uploaded_at).toLocaleDateString(locale) : null
                      }
                      size={formatBytes(s?.file_size)}
                      lang={lang}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
