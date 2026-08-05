import Link from 'next/link'
import { getSuperAdminContext } from '@/lib/super-admin/context'
import { PermissionToggle } from './permission-toggle'

type Labelled = { key: string; label?: { en?: string; bn?: string } | null }

// Roles / permissions matrix (#295 CRUD, over #271 viewer). Each cell toggles a
// grant via the audited set_role_permission RPC.
export default async function RolePermissionsPage() {
  const { supabase } = await getSuperAdminContext()

  const [{ data: roles }, { data: permissions }, { data: grants }] = await Promise.all([
    supabase.from('roles').select('key, label').order('key'),
    supabase.from('permissions').select('key, description').order('key'),
    supabase.from('role_permissions').select('role_key, permission_key'),
  ])

  const granted = new Set((grants ?? []).map((g) => `${g.role_key}::${g.permission_key}`))
  const roleLabel = (r: Labelled) => r.label?.en ?? r.key

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Roles &amp; Permissions</h1>
        <Link href="/super-admin" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        <p className="mb-3 text-sm text-muted">
          Role-based access grants (config source of truth for <code>app_has_permission</code>).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-muted">
                <th className="py-2 pr-4">Permission</th>
                {roles?.map((r) => (
                  <th key={r.key} className="py-2 px-3 text-center whitespace-nowrap">
                    {roleLabel(r as Labelled)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {permissions?.map((p) => (
                <tr key={p.key}>
                  <td className="py-2 pr-4">
                    <div className="font-mono text-xs font-semibold">{p.key}</div>
                    <div className="text-xs text-muted">{p.description}</div>
                  </td>
                  {roles?.map((r) => (
                    <td key={r.key} className="px-3 py-1.5 text-center">
                      <div className="flex justify-center">
                        <PermissionToggle
                          roleKey={r.key}
                          permissionKey={p.key}
                          granted={granted.has(`${r.key}::${p.key}`)}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
