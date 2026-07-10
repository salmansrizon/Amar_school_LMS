import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t, type Lang } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { formatBytes } from '@/lib/routine'
import { SyllabusRow } from './syllabus-controls'

// Layout per ui/school-owner/syllabus-upload.html: the "Existing Syllabus
// Files" table (Class | Current File | Uploaded On | Size | Actions), one row
// per class, upload/replace inline. The mockup's separate top upload form is
// redundant with the per-row Upload buttons and is deliberately skipped, as is
// its per-subject option — the schema (and ticket) are one syllabus per class.

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'

export default async function SyllabusPage() {
  const lang: Lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: classes }, { data: syllabi }] = await Promise.all([
    supabase.from('classes').select('id, name, section').order('created_at'),
    supabase.from('class_syllabi').select('class_id, file_name, uploaded_at, file_size'),
  ])

  const byClass = new Map((syllabi ?? []).map((s) => [s.class_id, s]))
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('syllabus.title', lang)}</h1>
        <Link href="/school/classes" className="text-sm text-brand-600 hover:underline">
          ← {t('classes.title', lang)}
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">{t('syllabus.intro', lang)}</p>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
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
                      classLabel={`${c.name}${c.section ? ` - ${c.section}` : ''}`}
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
    </main>
  )
}
