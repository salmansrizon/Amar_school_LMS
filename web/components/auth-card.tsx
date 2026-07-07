import { LangSwitch } from '@/components/lang-switch'
import { t, type Lang } from '@/lib/i18n'

export function AuthCard({
  lang,
  title,
  children,
}: {
  lang: Lang
  title: string
  children: React.ReactNode
}) {
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
