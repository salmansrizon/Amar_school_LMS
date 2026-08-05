import Link from 'next/link'
import { getSchoolContext } from '@/lib/school/context'
import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { formatTaka } from '@/lib/money'
import { listSmsPackages } from '@/lib/sms/commerce'
import { BuyButton } from './buy-button'

// School SMS package purchase (#300). Owner picks a package → issues an SMS-income
// invoice + tops up the school SMS wallet (system-side). Balance shows on the SMS page.
export default async function BuySmsPage() {
  const { supabase, role } = await getSchoolContext()
  const lang = await currentLang()
  const packages = await listSmsPackages(supabase)

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('sms.buyTitle', lang)}</h1>
        <Link href="/school/sms" className="text-sm text-brand-600 hover:underline">
          ← {t('sms.composeTitle', lang)}
        </Link>
      </div>

      {role !== 'school_owner' && (
        <p className="mb-4 rounded-lg border border-line bg-amber-50 p-3 text-sm text-amber-700">
          {t('sms.buyOwnerOnly', lang)}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {packages.map((p) => (
          <section key={p.id} className="flex flex-col gap-2 rounded-lg border border-line bg-paper p-5 shadow-card">
            <div className="text-lg font-bold">{p.name.en ?? p.name.bn ?? 'SMS'}</div>
            <div className="text-2xl font-extrabold text-brand-700">
              {p.segments.toLocaleString('en-US')}{' '}
              <span className="text-sm font-medium text-muted">{t('sms.segments', lang)}</span>
            </div>
            <div className="text-sm text-muted">{formatTaka(p.price)}</div>
            <div className="mt-auto">{role === 'school_owner' && <BuyButton packageId={p.id} lang={lang} />}</div>
          </section>
        ))}
        {!packages.length && <p className="text-sm text-muted">{t('sms.buyNone', lang)}</p>}
      </div>

      <p className="mt-4 text-xs text-muted">{t('sms.buyNote', lang)}</p>
    </div>
  )
}
