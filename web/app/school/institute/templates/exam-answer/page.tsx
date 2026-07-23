import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintPage, InstituteHeader, InfoGrid, BlankLine } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'

// Blank Exam Answer Sheet (issue #39, PRD §5.11) — paper-fallback template.

function RuledLines({ count }: { count: number }) {
  return (
    <div className="mt-4 space-y-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-4 border-b border-dashed border-line-strong" />
      ))}
    </div>
  )
}

export default async function BlankExamAnswerPage() {
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
        <InstituteHeader institute={institute ?? undefined} docTitle={t('institute.templateExamAnswer', lang)} />
        <InfoGrid
          rows={[
            { label: t('institute.examTitle', lang), value: <BlankLine width="w-56" /> },
            { label: t('institute.studentName', lang), value: <BlankLine width="w-56" /> },
            { label: t('institute.roll', lang), value: <BlankLine /> },
            { label: t('institute.class', lang), value: <BlankLine /> },
            { label: t('institute.subject', lang), value: <BlankLine /> },
            { label: t('institute.date', lang), value: <BlankLine /> },
          ]}
        />
        <div className="text-xs font-semibold text-muted">{t('institute.answerSheet', lang)}</div>
        <RuledLines count={18} />
      </PrintPage>
    </main>
  )
}
