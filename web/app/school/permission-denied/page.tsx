import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { getSchoolContext } from '@/lib/school/context'
import { notFound } from 'next/navigation'
import { safeReturnPath } from '@/lib/auth/return-path'
import { isSchoolPath, screenKeyForPath } from '@/lib/auth/screens'
import { DeniedState } from '@/components/ui/states'

// #538: a refusal is a designed state. It says what was refused, where to go
// instead, and who can lift it. The proxy passes the intended destination in
// `from` (proxy.ts), which is why this page reads searchParams at all.
export default async function PermissionDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  const destination = safeReturnPath(from)
  // The proxy refuses a /school URL that names no Screen (fail closed, #515)
  // and sends it here like any refusal. But nobody can grant a Screen that does
  // not exist, so "permission denied — contact the owner" is the wrong answer,
  // most of all to the Owner. It is a page that is not there: say that. Access
  // is unchanged — the proxy still never serves the URL.
  if (destination && isSchoolPath(destination) && !screenKeyForPath(destination)) notFound()

  const lang = await currentLang()
  const { supabase, schoolId } = await getSchoolContext()

  // The Owner's own contact details are not readable by a Staff User, but the
  // institute's are — and in a Bangladeshi school those are the Owner's phone in
  // practice. A missing number renders no button rather than a dead one.
  const { data: school } = await supabase
    .from('schools')
    .select('mobile, email')
    .eq('id', schoolId)
    .maybeSingle()
  const contactHref = school?.mobile ? `tel:${school.mobile}` : school?.email ? `mailto:${school.email}` : null

  return (
    <DeniedState
      destination={destination}
      homeHref="/school"
      contactHref={contactHref}
      contactLabel={school?.mobile ? `${t('denied.contact', lang)} — ${school.mobile}` : null}
      lang={lang}
    />
  )
}
