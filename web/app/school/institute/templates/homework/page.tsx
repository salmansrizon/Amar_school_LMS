import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintPage, InstituteHeader, InfoGrid, BlankLine, BlankRosterTable } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'

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

  const { data: school } = await supabase.from('schools').select('name').maybeSingle()

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/school/institute/templates" className="text-sm text-brand-600 hover:underline">
          ← {t('institute.tabTemplates', lang)}
        </Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage>
        <InstituteHeader name={school?.name ?? ''} docTitle={t('institute.templateHomework', lang)} />
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
