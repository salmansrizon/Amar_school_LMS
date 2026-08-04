import { TerritorySchools } from '@/components/territory-schools'
import { currentLang } from '@/lib/i18n-server'
import { getDistributorContext } from '@/lib/distributor/context'
import { loadDistributorWallet } from '@/lib/distributor/wallet'
import { formatTaka } from '@/lib/money'

// Distributor dashboard (#271). Pipeline + task + wallet snapshot, then the
// territory schools list. All data RLS-scoped to the signed-in distributor.
export default async function DistributorHome() {
  const lang = await currentLang()
  const { supabase, userId, fullName } = await getDistributorContext()

  const [{ data: leads }, openTasks, wallet] = await Promise.all([
    supabase.from('leads').select('stage'),
    supabase.from('partner_tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    loadDistributorWallet(supabase, userId),
  ])

  const balance = wallet.balance
  const won = (leads ?? []).filter((l) => l.stage === 'won').length
  const openLeads = (leads ?? []).filter((l) => !['won', 'lost'].includes(l.stage)).length

  const stats = [
    { label: 'Open leads', value: String(openLeads) },
    { label: 'Won', value: String(won) },
    { label: 'Open tasks', value: String(openTasks.count ?? 0) },
    { label: 'Wallet', value: formatTaka(balance) },
  ]

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <h1 className="mb-1 text-2xl font-extrabold">{fullName}</h1>
      <p className="mb-4 text-sm text-muted">Distributor overview</p>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-line bg-paper p-4 shadow-card">
            <div className="text-2xl font-extrabold text-brand-700">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <TerritorySchools lang={lang} />
      </section>
    </main>
  )
}
