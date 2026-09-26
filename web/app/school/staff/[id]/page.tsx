import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { navGroupFor } from '@/lib/school-nav'
import { Card, PageHeader } from '@/components/ui/page'
import { GrantList } from './grant-list'

export default async function StaffPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await currentLang()
  const { supabase, role } = await getSchoolContext()
  if (role !== 'school_owner') redirect('/school')

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', id)
    .eq('role', 'staff_user')
    .single()
  if (!staff) notFound()

  const { data: grants } = await supabase
    .from('staff_permissions')
    .select('screen_key')
    .eq('staff_user_id', id)
  const granted = new Set((grants ?? []).map((g) => g.screen_key))
  const group = navGroupFor('/school/staff')?.group

  return (
    <>
      <PageHeader
        title={`${t('staff.screens', lang)} — ${staff.full_name}`}
        backHref="/school/staff"
        backLabel={t('staff.list', lang)}
        crumbs={{
          lang,
          items: [
            { label: t('dash.dashboard', lang), href: '/school' },
            ...(group ? [{ label: t(group.labelKey, lang) }] : []),
            { label: t('staff.title', lang), href: '/school/staff' },
            { label: staff.full_name ?? staff.id },
          ],
        }}
      />

      <Card>
        <GrantList staffUserId={staff.id} granted={granted} lang={lang} />
      </Card>
    </>
  )
}
