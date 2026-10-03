import { AlertTriangle, HandCoins, Receipt, Wallet } from 'lucide-react'
import { getSchoolContext } from '@/lib/school/context'
import { feeStanding, feePeriodLabel, type FeeStanding } from '@/lib/fees'
import { t, numberFmt, localeOf, type Lang } from '@/lib/i18n'
import { withParams, type Params } from '@/lib/url-params'
import { Pill } from '@/components/data-table/data-table'
import { DrawerFacts, DrawerSection, DrawerItemCard, type DrawerFact } from '@/components/data-table/drawer-parts'

// Fee record drawer body (drawer redesign): the same pay/fine/adjust/due/
// method facts the old dl showed, plus a Payment History section — the same
// student's other fee_collection_records, fetched only for the open ?view=
// id (never for the whole month's list).

const STANDING_TONE = { paid: 'mint', partial: 'sun', due: 'alert' } as const
const STANDING_LABEL = { paid: 'students.feePaid', partial: 'students.feePartial', due: 'students.feeDue' } as const
const METHODS = ['cash', 'cheque', 'bank'] as const

type HistoryRow = { id: string; month: number; year: number; standing: FeeStanding; due: number }
export type FeeDrawerData = { history: HistoryRow[] }

export type FeeDrawerRecord = {
  id: string
  student_id: string
  pay: number
  fine: number
  adjust: number
  due: number
  method: string
  standing: FeeStanding
}

/** The same student's other Fee Collection Records (up to 4, most recent
 *  first, excluding the one already open) — fetched only for the open
 *  `view` id. */
export async function loadFeeDrawerData(studentId: string, excludeId: string): Promise<FeeDrawerData> {
  const { supabase } = await getSchoolContext()
  const { data } = await supabase
    .from('fee_collection_records')
    .select('id, month, year, pay_amount, due_amount')
    .eq('student_id', studentId)
    .neq('id', excludeId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(4)
  const history: HistoryRow[] = (data ?? []).map((r) => ({
    id: r.id,
    month: r.month,
    year: r.year,
    due: Number(r.due_amount),
    standing: feeStanding({ pay_amount: Number(r.pay_amount), due_amount: Number(r.due_amount) }) ?? 'due',
  }))
  return { history }
}

export function FeeDrawerBody({ record, data, lang }: { record: FeeDrawerRecord; data: FeeDrawerData; lang: Lang }) {
  const fmt = numberFmt(lang)
  const tk = (n: number) => `৳${fmt.format(n)}`
  const methodLabel = (m: string) => ((METHODS as readonly string[]).includes(m) ? t(`fees.${m}` as 'fees.cash', lang) : m)

  const facts: DrawerFact[] = [
    { icon: <Wallet className="size-3.5" aria-hidden />, label: t('fees.pay', lang), value: tk(record.pay) },
    { icon: <Receipt className="size-3.5" aria-hidden />, label: t('fees.fine', lang), value: tk(record.fine) },
    { icon: <HandCoins className="size-3.5" aria-hidden />, label: t('fees.adjust', lang), value: tk(record.adjust) },
    { icon: <AlertTriangle className="size-3.5" aria-hidden />, label: t('fees.due', lang), value: tk(record.due) },
    { icon: <Receipt className="size-3.5" aria-hidden />, label: t('fees.method', lang), value: methodLabel(record.method) },
  ]

  return (
    <div className="space-y-1">
      <div className="mb-1">
        <Pill tone={STANDING_TONE[record.standing]} pulse={record.standing === 'due'}>
          {t(STANDING_LABEL[record.standing], lang)}
        </Pill>
      </div>
      <DrawerFacts facts={facts} />

      <DrawerSection title={t('fees.historySectionTitle', lang)} count={data.history.length} defaultOpen={data.history.length > 0}>
        {data.history.length > 0 ? (
          <div className="space-y-2">
            {data.history.map((h) => (
              <DrawerItemCard
                key={h.id}
                icon={<Wallet className="size-4" aria-hidden />}
                title={feePeriodLabel(h.month, h.year, localeOf(lang))}
                meta={h.standing !== 'paid' ? [tk(h.due)] : []}
                status={<Pill tone={STANDING_TONE[h.standing]}>{t(STANDING_LABEL[h.standing], lang)}</Pill>}
                href={`/school/fees/receipt/${h.id}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('fees.noHistory', lang)}</p>
        )}
      </DrawerSection>
    </div>
  )
}

export function feeDrawerCancelHref(params: Params): string {
  return withParams(params, { view: null })
}
