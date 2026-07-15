import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintPage, InstituteHeader, InfoGrid, BlankLine, SignatureRow } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'

// Blank Admission Form (issue #39, PRD §5.11) — paper-fallback template.
// Same seam as the filled admission printable (#46): shared print pieces,
// browser-native print (ADR 0007). Unlike that one every value is blank.

export default async function BlankAdmissionPage() {
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
        <Link href="/school/institute/templates" aria-label={t('institute.tabTemplates', lang)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage>
        <InstituteHeader name={school?.name ?? ''} docTitle={t('institute.templateAdmission', lang)} />
        <InfoGrid
          rows={[
            { label: t('institute.studentName', lang), value: <BlankLine width="w-56" /> },
            { label: t('institute.class', lang), value: <BlankLine /> },
            { label: t('institute.section', lang), value: <BlankLine /> },
            { label: t('institute.roll', lang), value: <BlankLine /> },
            { label: t('institute.dob', lang), value: <BlankLine /> },
            { label: t('institute.gender', lang), value: <BlankLine /> },
            { label: t('institute.guardianName', lang), value: <BlankLine width="w-56" /> },
            { label: t('institute.guardianMobile', lang), value: <BlankLine /> },
            { label: t('institute.address2', lang), value: <BlankLine width="w-56" /> },
          ]}
        />
        <SignatureRow labels={[t('institute.guardianName', lang), t('institute.signature', lang)]} />
      </PrintPage>
    </main>
  )
}
