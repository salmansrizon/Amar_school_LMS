import { LangSwitch } from '@/components/lang-switch'
import { t, type Lang } from '@/lib/i18n'
import { brandInitial, type SchoolBrand } from '@/lib/school-branding'

export function AuthCard({
  lang,
  title,
  brand,
  children,
}: {
  lang: Lang
  title: string
  /** When present, render the school's logo + name beside the form (issue #110). */
  brand?: SchoolBrand | null
  children: React.ReactNode
}) {
  if (brand) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="grid w-full max-w-3xl overflow-hidden rounded-lg border border-line bg-paper shadow-card sm:grid-cols-2">
          <div className="flex flex-col items-center justify-center gap-3 border-b border-line bg-brand-50 p-8 text-center sm:border-b-0 sm:border-r">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" className="size-20 rounded-md object-contain" />
            ) : (
              <span className="flex size-20 items-center justify-center rounded-md bg-brand-500 text-2xl font-bold text-white">
                {brandInitial(brand.name)}
              </span>
            )}
            <span className="text-lg font-extrabold">{brand.name}</span>
            <span className="text-xs text-muted">{t('brandedLogin.tagline', lang)}</span>
          </div>
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">{t('app.name', lang)}</span>
              <LangSwitch lang={lang} />
            </div>
            <h1 className="mb-4 text-xl font-bold">{title}</h1>
            {children}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-paper p-6 shadow-card">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-sm bg-brand-500 text-sm font-bold text-white">
              A
            </span>
            <span className="font-extrabold">{t('app.name', lang)}</span>
          </div>
          <LangSwitch lang={lang} />
        </div>
        <h1 className="mb-4 text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  )
}

export const inputClass =
  'h-10 w-full rounded-sm border border-line-strong bg-paper px-3 text-sm outline-none focus:border-brand-500'
export const labelClass = 'mb-1 block text-xs font-semibold text-muted'
export const primaryBtnClass =
  'h-10 w-full cursor-pointer rounded-full bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
