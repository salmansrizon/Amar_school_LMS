import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintPage, InstituteHeader, InfoGrid, BlankLine } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'

// Blank Lesson Plan Sheet (issue #39, PRD §5.11) — paper-fallback template.

function RuledLines({ count }: { count: number }) {
  return (
    <div className="mt-2 space-y-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-4 border-b border-dashed border-line-strong" />
      ))}
    </div>
  )
}

export default async function BlankLessonPlanPage() {
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
        <InstituteHeader name={school?.name ?? ''} docTitle={t('institute.templateLessonPlan', lang)} />
        <InfoGrid
          rows={[
            { label: t('institute.class', lang), value: <BlankLine /> },
            { label: t('institute.section', lang), value: <BlankLine /> },
            { label: t('institute.subject', lang), value: <BlankLine /> },
            { label: t('institute.teacher', lang), value: <BlankLine /> },
            { label: t('institute.date', lang), value: <BlankLine /> },
            { label: t('institute.topic', lang), value: <BlankLine width="w-56" /> },
          ]}
        />
        <div className="text-xs font-semibold text-muted">{t('institute.objective', lang)}</div>
        <RuledLines count={3} />
        <div className="mt-4 text-xs font-semibold text-muted">{t('institute.homeworkGiven', lang)}</div>
        <RuledLines count={2} />
      </PrintPage>
    </main>
  )
}
