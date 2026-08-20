import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { formatTaka } from '@/lib/money'
import { AddCouponForm, CouponRowActions } from './coupon-forms'
import { railClass } from '@/components/ui/page'

// Coupons / discounts admin (#291 CRUD, over #271 viewer). Create/activate/delete
// discount codes. RLS: "super admin manages discounts".
export default async function CouponsPage() {
  const { supabase } = await getSuperAdminContext()

  const { data: coupons } = await supabase
    .from('discounts')
    .select('code, scope, discount_type, value, active, expires_at')
    .order('code')

  return (
    <main className="w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Coupons</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5">
        <h2 className="mb-3 font-bold">Add a coupon</h2>
        <AddCouponForm />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Scope</th>
                <th className="py-2 pr-4">Value</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {coupons?.map((c) => (
                <tr key={c.code}>
                  <td className={`py-2 pr-4 font-mono text-xs font-semibold ${railClass(c.active ? 'mint' : 'alert')}`}>{c.code}</td>
                  <td className="py-2 pr-4 text-muted">{c.scope}</td>
                  <td className="py-2 pr-4 font-medium">
                    {c.discount_type === 'percent' ? `${c.value}%` : formatTaka(c.value)}
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.active ? 'bg-mint-soft text-mint-deep' : 'bg-alert-soft text-alert-deep'}`}
                    >
                      {c.active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <CouponRowActions code={c.code} active={c.active} />
                  </td>
                </tr>
              ))}
              {!coupons?.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted">
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
