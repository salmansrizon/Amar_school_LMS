import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import {
  AddEmployeeForm,
  AddShiftForm,
  CategoryGraceForm,
  DefaultGraceForm,
  ShiftToggle,
} from './employee-controls'

export default async function EmployeesPage() {
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  // Defense in depth alongside the proxy gate: /school pages are for school roles.
  if (!me?.school_id || (me.role !== 'school_owner' && me.role !== 'staff_user')) redirect('/login')

  const [
    { data: school },
    { data: shifts },
    { data: categories },
    { data: employees },
    { data: assignments },
    { data: graceRows },
  ] = await Promise.all([
    supabase.from('schools').select('default_grace_minutes').eq('id', me.school_id).single(),
    supabase.from('shifts').select('id, name, grace_minutes').order('name'),
    supabase.from('category_grace_minutes').select('category, grace_minutes').order('category'),
    supabase.from('employees').select('id, full_name, category, grace_override_minutes').order('full_name'),
    supabase.from('employee_shifts').select('employee_id, shift_id'),
    supabase.rpc('effective_grace_for_my_school'),
  ])

  const effective = new Map<string, number>(
    ((graceRows ?? []) as { employee_id: string; grace: number }[]).map((r) => [r.employee_id, r.grace]),
  )
  const assignedSet = new Set((assignments ?? []).map((a) => `${a.employee_id}:${a.shift_id}`))

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('employees.title', lang)}</h1>
        <Link href="/school" className="text-sm text-brand-600 hover:underline">
          ← {t('common.back', lang)}
        </Link>
      </div>
      <p className="mb-4 text-xs text-muted">{t('grace.hint', lang)}</p>

      <section className="mb-6 grid gap-4 rounded-lg border border-line bg-paper p-5 shadow-card sm:grid-cols-3">
        <DefaultGraceForm current={school?.default_grace_minutes ?? null} lang={lang} />
        <AddShiftForm lang={lang} />
        <CategoryGraceForm lang={lang} />
        <div className="text-xs text-muted sm:col-span-3">
          {shifts?.map((s) => (
            <span key={s.id} className="mr-3">
              {s.name}: {s.grace_minutes ?? '—'}m
            </span>
          ))}
          {categories?.map((c) => (
            <span key={c.category} className="mr-3">
              {c.category}: {c.grace_minutes}m
            </span>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-line bg-paper p-5 shadow-card">
        <h2 className="mb-3 font-bold">{t('employees.add', lang)}</h2>
        <AddEmployeeForm lang={lang} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-5 shadow-card">
        {!employees?.length && <p className="text-sm text-muted">{t('employees.none', lang)}</p>}
        <ul className="divide-y divide-line">
          {employees?.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-medium">{e.full_name}</span>
                  {e.category && <span className="ml-2 text-xs text-muted">{e.category}</span>}
                  {e.grace_override_minutes !== null && (
                    <span className="ml-2 text-xs text-muted">
                      {t('employees.override', lang)}: {e.grace_override_minutes}
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                  {t('employees.effective', lang)}: {effective.get(e.id) ?? 0}m
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{t('employees.shifts', lang)}:</span>
                {shifts?.map((s) => (
                  <ShiftToggle
                    key={s.id}
                    employeeId={e.id}
                    shiftId={s.id}
                    label={s.name}
                    assigned={assignedSet.has(`${e.id}:${s.id}`)}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
