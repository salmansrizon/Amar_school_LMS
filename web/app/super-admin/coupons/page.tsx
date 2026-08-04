import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'

// Coupons / discounts viewer (#271 / commission-settlement 0087). Lists the
// discount codes, their type, value, scope and validity.
export default async function CouponsPage() {
  const { supabase } = await getSuperAdminContext()

  const { data: coupons } = await supabase
    .from('discounts')
    .select('code, scope, discount_type, value, active, expires_at')
    .order('code')

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Coupons</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Scope</th>
                <th className="py-2 pr-4">Value</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {coupons?.map((c) => (
                <tr key={c.code}>
                  <td className="py-2 pr-4 font-mono text-xs font-semibold">{c.code}</td>
                  <td className="py-2 pr-4 text-muted">{c.scope}</td>
                  <td className="py-2 pr-4 font-medium">
                    {c.discount_type === 'percent' ? `${c.value}%` : formatTaka(c.value)}
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-alert-soft text-alert-deep'}`}
                    >
                      {c.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {!coupons?.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">
                    No coupons defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
