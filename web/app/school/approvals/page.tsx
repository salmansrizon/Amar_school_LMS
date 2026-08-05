import Link from 'next/link'
import { getSchoolContext } from '@/lib/school/context'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { DecideControls } from './decide-controls'

type Labelled = { label?: { en?: string; bn?: string } | null }

// School approvals inbox (#317). In-progress workflow instances for the tenant;
// the current stage's approver acts via workflow_decide (RPC-enforced). RLS
// ("members read own instances") scopes the list to the school.
export default async function ApprovalsPage() {
  const { supabase } = await getSchoolContext()
  const lang = await currentLang()

  const { data: instances } = await supabase
    .from('workflow_instances')
    .select('id, definition_key, entity_type, entity_id, current_seq, created_at')
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })

  const { data: defs } = await supabase.from('workflow_definitions').select('key, label')
  const label = new Map((defs ?? []).map((d) => [d.key, (d as Labelled).label?.en ?? d.key]))

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('approvals.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <ul className="divide-y divide-line">
          {instances?.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <div className="text-sm font-semibold">{label.get(i.definition_key) ?? i.definition_key}</div>
                <div className="text-xs text-muted">
                  {i.entity_type} · stage {i.current_seq} ·{' '}
                  {new Date(i.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
              <DecideControls instanceId={i.id} lang={lang} />
            </li>
          ))}
          {!instances?.length && <li className="py-6 text-center text-muted">{t('approvals.none', lang)}</li>}
        </ul>
      </section>
    </main>
  )
}
