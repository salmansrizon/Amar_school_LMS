import Link from 'next/link'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { applyGlobalShiftFilterToOfferings } from '@/lib/school/shift-filter'
import { formatBytes } from '@/lib/routine'
import { SyllabusRow } from './syllabus-controls'
import { classCatalogueLabel } from '@/lib/class-catalogue'

// Layout per ui/school-owner/syllabus-upload.html: the "Existing Syllabus
// Files" table (Class | Current File | Uploaded On | Size | Actions), one row
// per class, upload/replace inline. The mockup's separate top upload form is
// redundant with the per-row Upload buttons and is deliberately skipped, as is
// its per-subject option — the schema (and ticket) are one syllabus per class.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'

export default async function SyllabusPage() {
  const lang: Lang = await currentLang()
  const { supabase, shiftSelection } = await getSchoolContext()

  const [{ data: classes }, { data: syllabi }] = await Promise.all([
    applyGlobalShiftFilterToOfferings(
      supabase.from('class_offerings').select('id, name, section, group_department').order('created_at'),
      shiftSelection,
    ),
    supabase.from('class_syllabi').select('class_id, file_name, uploaded_at, file_size'),
  ])

  const byClass = new Map((syllabi ?? []).map((s) => [s.class_id, s]))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('syllabus.title', lang)}</h1>
        <Link href="/school/classes" aria-label={t('classes.title', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
      </div>
      <p className="mb-4 text-sm text-muted">{t('syllabus.intro', lang)}</p>

      <section className="rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-4 font-bold">{t('syllabus.existing', lang)}</h2>
        {!classes?.length ? (
          <p className="text-sm text-muted">{t('syllabus.noClasses', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line-strong">
                  <th className={thClass}>{t('classes.class', lang)}</th>
                  <th className={thClass}>{t('syllabus.currentFile', lang)}</th>
                  <th className={thClass}>{t('syllabus.uploadedOn', lang)}</th>
                  <th className={thClass}>{t('syllabus.size', lang)}</th>
                  <th className={thClass}>{t('classes.actions', lang)}</th>
                </tr>
              </thead>
              <tbody>
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
    </div>
  )
}
