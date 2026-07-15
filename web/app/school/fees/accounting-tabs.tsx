import Link from 'next/link'
import { t, type Lang } from '@/lib/i18n'

export type AccountingTab =
  | 'structures'
  | 'collection'
  | 'vouchers'
  | 'assets'
  | 'bank'
  | 'directorCapital'
  | 'ledger'

const TABS: { key: AccountingTab; href: string; labelKey: string }[] = [
  { key: 'structures', href: '/school/fees/structures', labelKey: 'fees.tabStructures' },
  { key: 'collection', href: '/school/fees', labelKey: 'fees.tabCollection' },
  { key: 'vouchers', href: '/school/fees/vouchers', labelKey: 'fees.tabVouchers' },
  { key: 'assets', href: '/school/fees/assets', labelKey: 'fees.tabAssets' },
  { key: 'bank', href: '/school/fees/bank', labelKey: 'fees.tabBank' },
  { key: 'directorCapital', href: '/school/fees/director-capital', labelKey: 'fees.tabDirectorCapital' },
  { key: 'ledger', href: '/school/fees/ledger', labelKey: 'fees.tabLedger' },
]

/** The 7-tab Accounting & Fees sub-nav shared by every screen under
 *  /school/fees, per the ui/school-owner/*.html mockups' identical tab bar
 *  (fee-structures / fee-collection / vouchers-list / asset-register /
 *  bank-cash-accounts / director-capital / general-ledger). Kept under the
 *  existing "fees" umbrella route rather than a new "accounting" route,
 *  following the precedent Accounting I (#34) already established. */
export function AccountingTabs({ active, lang }: { active: AccountingTab; lang: Lang }) {
  return (
    <nav className="mb-4 flex flex-nowrap gap-2 overflow-x-auto border-b border-line text-sm font-semibold">
      {TABS.map((tab) =>
        tab.key === active ? (
          <span key={tab.key} className="shrink-0 whitespace-nowrap border-b-2 border-brand-500 px-3 py-2 text-brand-700">
            {t(tab.labelKey as 'fees.tabCollection', lang)}
          </span>
        ) : (
          <Link key={tab.key} href={tab.href} className="shrink-0 whitespace-nowrap px-3 py-2 text-muted hover:text-ink">
            {t(tab.labelKey as 'fees.tabCollection', lang)}
          </Link>
        ),
      )}
    </nav>
  )
}
