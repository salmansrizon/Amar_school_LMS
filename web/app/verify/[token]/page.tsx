import { currentLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'

// Public, unauthenticated student ID-card verification (issues #140/#144).
// Anyone who scans the QR on a printed card lands here. It resolves the opaque
// token through the security-definer student_by_public_token RPC (students RLS
// blocks anon SELECT) and shows a validity badge computed live from the
// enrollment: a card goes INVALID the moment the student is archived. No
// session, no chrome — just the card and whether it's genuine.

export const runtime = 'nodejs' // storage signing needs Node APIs.

const dash = '—'

interface CardRow {
  full_name: string
  class_name: string | null
  section: string | null
  roll_number: number | null
  photo_path: string | null
  is_valid: boolean
  school_name: string
  school_logo_path: string | null
}

export default async function VerifyCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const lang = await currentLang()
  const supabase = await createClient()

  const { data } = await supabase.rpc('student_by_public_token', { token })
  const card = (data as CardRow[] | null)?.[0] ?? null

  // Sign the (anon-readable) logo and — only for a valid card — the photo.
  let logoUrl: string | null = null
  let photoUrl: string | null = null
  if (card) {
    if (card.school_logo_path) {
      const { data: signed } = await supabase.storage
        .from('school-logos')
        .createSignedUrl(card.school_logo_path, 3600)
      logoUrl = signed?.signedUrl ?? null
    }
    if (card.is_valid && card.photo_path) {
      const { data: signed } = await supabase.storage
        .from('student-photos')
        .createSignedUrl(card.photo_path, 600)
      photoUrl = signed?.signedUrl ?? null
    }
  }

  const v = (x: string | number | null | undefined) =>
    x === null || x === undefined || x === '' ? dash : x

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper-muted p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 text-center shadow-card">
        {card === null ? (
          <>
            <Badge tone="invalid" label={t('verify.notFound', lang)} />
            <p className="mt-4 text-sm text-muted">{t('verify.notFoundNote', lang)}</p>
          </>
        ) : (
          <>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="mx-auto mb-2 h-12 w-auto object-contain" />
            ) : null}
            <div className="mb-1 text-xs font-medium text-muted">{t('verify.issuedBy', lang)}</div>
            <div className="mb-4 text-sm font-bold text-ink">{card.school_name}</div>

            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={card.full_name}
                className="mx-auto mb-3 size-24 rounded-md border border-line object-cover"
              />
            ) : (
              <div className="mx-auto mb-3 flex size-24 items-center justify-center rounded-md border border-dashed border-line-strong text-xs text-muted">
                {t('students.photo', lang)}
              </div>
            )}

            <div className="text-lg font-extrabold text-ink">{card.full_name}</div>
            <div className="mb-4 text-xs text-muted">
              {`${v(card.class_name)} ${card.section ?? ''}`.trim()}
              {card.roll_number != null ? ` · ${t('students.roll', lang)} ${card.roll_number}` : ''}
            </div>

            <Badge
              tone={card.is_valid ? 'valid' : 'invalid'}
              label={card.is_valid ? t('verify.valid', lang) : t('verify.invalid', lang)}
            />
            <p className="mt-3 text-sm text-muted">
              {card.is_valid ? t('verify.validNote', lang) : t('verify.invalidNote', lang)}
            </p>
          </>
        )}
      </div>
    </main>
  )
}

function Badge({ tone, label }: { tone: 'valid' | 'invalid'; label: string }) {
  const cls =
    tone === 'valid'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
      : 'bg-red-50 text-red-700 ring-red-600/20'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ring-1 ${cls}`}
    >
      <span aria-hidden="true">{tone === 'valid' ? '✓' : '✕'}</span>
      {label}
    </span>
  )
}
