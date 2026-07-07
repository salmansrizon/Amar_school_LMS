import { cookies } from 'next/headers'
import { DEFAULT_LANG, LANG_COOKIE, type Lang } from '@/lib/i18n'

export async function currentLang(): Promise<Lang> {
  const store = await cookies()
  const value = store.get(LANG_COOKIE)?.value
  return value === 'en' || value === 'bn' ? value : DEFAULT_LANG
}
