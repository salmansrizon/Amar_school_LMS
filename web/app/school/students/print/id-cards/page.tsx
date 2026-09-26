import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { PrintPage } from '@/components/print/pieces'
import { PrintButton } from '@/components/print/print-button'
import { loadInstitutePrintHeader } from '@/lib/institute-print'
import { renderAuthenticityQr } from '@/lib/qr'
import { ID_CARD_COLUMNS, StudentIdCard, type IdCardStudent } from '../../id-card'
import { loadDirectoryRows, type DirectoryParams } from '../../directory-rows'

// Bulk ID cards for the directory's current filter (map 013, P1): the same
// rows the list shows, the same card the single print page uses.
const CHUNK = 200 // keeps the `in (...)` list well under URL limits

export default async function BulkIdCardsPage({ searchParams }: { searchParams: Promise<DirectoryParams> }) {
  const params = await searchParams
  const lang = await currentLang()
  const { supabase } = await getSchoolContext()
  const [institute, { rows }] = await Promise.all([loadInstitutePrintHeader(supabase, lang), loadDirectoryRows(params)])
  if (!institute) notFound()

  const ids = rows.map((r) => r.id)
  const students: IdCardStudent[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabase.from('students').select(ID_CARD_COLUMNS).in('id', ids.slice(i, i + CHUNK))
    students.push(...((data ?? []) as IdCardStudent[]))
  }
  const order = new Map(ids.map((id, i) => [id, i]))
  students.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const h = await headers()
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`
  const qrs = await Promise.all(students.map((s) => renderAuthenticityQr(`${origin}/verify/${s.public_token}`)))

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/school/students" className="text-sm font-semibold text-brand-600 hover:underline">
          ‹ {t('students.listTitle', lang)}
        </Link>
        <span className="text-sm text-muted">{students.length}</span>
        <PrintButton label={t('print.print', lang)} />
      </div>
      <PrintPage>
        <div className="grid grid-cols-2 gap-4 print:gap-2">
          {students.map((s, i) => (
            <div key={s.id} className="break-inside-avoid">
              <StudentIdCard institute={institute} student={s} qrSvg={qrs[i]} lang={lang} />
            </div>
          ))}
        </div>
      </PrintPage>
    </main>
  )
}
