import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { PrintPage, QrFooterRow } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'

// Printable student ID card (issue #46, PRD §5.1). ADR 0007: browser-native
// print. A photo upload flow lands with the admission profile (#27); until
// then the photo slot is a placeholder box.

const dash = '—'

export default async function IdCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lang = await currentLang()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'school_owner' && me?.role !== 'staff_user') redirect('/login')

  const [{ data: school }, { data: student }] = await Promise.all([
    supabase.from('schools').select('name').maybeSingle(),
    supabase
      .from('students')
      .select('full_name, class_name, section, roll_number, blood_group, guardian_mobile')
      .eq('id', id)
      .maybeSingle(),
  ])
  if (!school || !student) notFound()

  const v = (x: string | number | null | undefined) => (x === null || x === undefined || x === '' ? dash : x)

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/school/students/${id}`} className="text-sm text-brand-600 hover:underline">
          ← {t('students.title', lang)}
        </Link>
        <PrintButton label={t('print.print', lang)} />
      </div>

      <PrintPage>
        <div className="mx-auto w-full max-w-80 rounded-lg border-2 border-brand-500 p-4 text-center">
          <div className="mb-2 text-sm font-bold">{school.name}</div>
          <div className="mx-auto mb-3 flex size-20 items-center justify-center rounded-md border border-dashed border-line-strong text-xs text-muted">
            {t('students.photo', lang)}
          </div>
          <div className="text-base font-extrabold">{student.full_name}</div>
          <div className="mb-3 text-xs text-muted">
            {`${v(student.class_name)} ${student.section ?? ''}`.trim()}
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-left text-xs">
            <dt className="text-muted">{t('students.roll', lang)}</dt>
            <dd>{v(student.roll_number)}</dd>
            <dt className="text-muted">{t('students.bloodGroup', lang)}</dt>
            <dd>{v(student.blood_group)}</dd>
            <dt className="text-muted">{t('students.guardianMobile', lang)}</dt>
            <dd>{v(student.guardian_mobile)}</dd>
          </dl>
        </div>
        <QrFooterRow qrLabel={t('print.qr', lang)} poweredBy={t('print.poweredBy', lang)} />
      </PrintPage>
    </main>
  )
}
