import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintPage, InstituteHeader, InfoGrid, BlankLine, BlankRosterTable } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'

// Blank Homework Collection Sheet (issue #39, PRD §5.11) — paper-fallback template.

export default async function BlankHomeworkPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const institute = await loadInstitutePrintHeader(supabase, lang)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/school/institute/templates" aria-label={t('institute.tabTemplates', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage>
        <InstituteHeader institute={institute ?? undefined} docTitle={t('institute.templateHomework', lang)} />
        <InfoGrid
          rows={[
            { label: t('institute.class', lang), value: <BlankLine /> },
            { label: t('institute.section', lang), value: <BlankLine /> },
            { label: t('institute.subject', lang), value: <BlankLine /> },
            { label: t('institute.date', lang), value: <BlankLine /> },
          ]}
        />
        <BlankRosterTable
          columns={[t('institute.roll', lang), t('institute.studentName', lang), t('institute.homeworkGiven', lang), t('institute.submitted', lang)]}
          rowCount={20}
        />
      </PrintPage>
    </main>
  )
}
