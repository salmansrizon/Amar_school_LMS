import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentLang } from '@/lib/i18n-server'
import { formatDate, formatMoney, formatNumber, localeOf, t, type Lang, type MessageKey } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import { feePeriodLabel } from '@/lib/fees'
import { studentClassLabel } from '@/lib/students'
import {
  KIND_LABEL,
  TOKEN_RE,
  UUID_RE,
  changedAfterPrint,
  isPrintKind,
  parsePrintDate,
  toVerifyModel,
  type Facts,
  type VerifyReason,
} from '@/lib/print-verify'
import { VerifyBadge, VerifyCard } from '../../../card'

// Public, unauthenticated verification of a printed document. Every print
// carries a QR to /verify/d/<kind>/<token>[/<ref>]?p=YYYYMMDD. The facts come
// from print_document_facts() (migration 0260), live at scan time; the page
// shows the allow-listed few and a Genuine / Not valid badge, never the
// document itself. Server-rendered: the browser fetches no data.
//
// Unknown kind, malformed or wrong token, wrong reference, and the function
// not existing yet all end in the same notFound() (./not-found.tsx, HTTP 404).

export const runtime = 'nodejs' // storage signing needs Node APIs.

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: t('verifyDoc.title', await currentLang()),
    robots: { index: false, follow: false },
    // The URL is the credential: keep it out of Referer on the logo fetch.
    referrer: 'no-referrer',
  }
}

const REASON_NOTE: Record<VerifyReason, MessageKey> = {
  archived: 'verifyDoc.reasonArchived',
  unpublished: 'verifyDoc.reasonUnpublished',
  exam_closed: 'verifyDoc.reasonExamClosed',
  voided: 'verifyDoc.reasonVoided',
}

/** Label/value rows, in reading order. Only keys of the model's `facts`. */
function factRows(f: Facts, lang: Lang): [string, string][] {
  const year = (n: number) => formatNumber(n, lang, { useGrouping: false })
  const rows: [string, string | null][] = [
    [t('markSheet.studentName', lang), (f.studentName as string) ?? null],
    [
      t('students.class', lang),
      f.className ? studentClassLabel(f.className as string, (f.section as string) ?? null) : null,
    ],
    [t('exams.year', lang), f.classYear !== undefined ? year(f.classYear as number) : null],
    [t('students.roll', lang), f.roll !== undefined ? year(f.roll as number) : null],
    [t('students.studentNo', lang), (f.studentNo as string) ?? null],
    [
      t('verifyDoc.exam', lang),
      f.examName ? `${f.examName}${f.examYear !== undefined ? ` ${year(f.examYear as number)}` : ''}` : null,
    ],
    [
      t('verifyDoc.totalObtained', lang),
      f.incomplete
        ? t('exams.incomplete', lang)
        : f.totalObtained !== undefined && f.totalFull !== undefined
          ? `${formatNumber(f.totalObtained as number, lang)} / ${formatNumber(f.totalFull as number, lang)}`
          : null,
    ],
    [
      t('fees.month', lang),
      f.month !== undefined && f.year !== undefined
        ? feePeriodLabel(f.month as number, f.year as number, localeOf(lang))
        : null,
    ],
    [t('fees.receivedAmount', lang), f.amount !== undefined ? formatMoney(f.amount as number, lang) : null],
    [t('verifyDoc.paidOn', lang), f.paidAt ? formatDate(f.paidAt as string, lang) : null],
    [t('fees.voidedOn', lang), f.voidAt ? formatDate(f.voidAt as string, lang) : null],
  ]
  return rows.filter((r): r is [string, string] => !!r[1])
}

export default async function VerifyDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; token: string; ref?: string[] }>
  searchParams: Promise<{ p?: string | string[] }>
}) {
  const { kind, token, ref } = await params
  const { p } = await searchParams
  if (!isPrintKind(kind) || !TOKEN_RE.test(token)) notFound()
  if (ref && (ref.length !== 1 || !UUID_RE.test(ref[0]))) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('print_document_facts', {
    p_kind: kind,
    p_token: token,
    p_ref: ref?.[0] ?? null,
  })
  // An error here is the function missing (0260 not applied) or the database
  // being away. Either way the visitor is told nothing more than "not valid".
  const model = error ? null : toVerifyModel(kind, data)
  if (!model) notFound()

  const lang = await currentLang()
  let logoUrl: string | null = null
  if (model.logoPath) {
    const { data: signed } = await supabase.storage.from('school-logos').createSignedUrl(model.logoPath, 3600)
    logoUrl = signed?.signedUrl ?? null
  }
  const printDate = parsePrintDate(p)
  const rows = factRows(model.facts, lang)

  return (
    <VerifyCard lang={lang}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="mx-auto mb-2 h-12 w-auto object-contain" />
      ) : null}
      <div className="mb-1 text-xs font-medium text-muted">{t('verify.issuedBy', lang)}</div>
      <div className="text-sm font-bold text-ink">{model.schoolName}</div>
      <h1 className="mt-4 mb-3 text-lg font-extrabold text-ink">{t(KIND_LABEL[model.kind], lang)}</h1>

      <VerifyBadge valid={model.valid} label={t(model.valid ? 'verifyDoc.genuine' : 'verifyDoc.notValid', lang)} />
      <p className="mt-3 text-sm text-muted">
        {model.reason ? t(REASON_NOTE[model.reason], lang) : t('verifyDoc.genuineNote', lang)}
      </p>

      {rows.length ? (
        <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-left text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {printDate && changedAfterPrint(model.changedAt, printDate) ? (
        <p className="mt-4 rounded-md bg-sun-soft p-2 text-xs font-semibold text-sun-deep">
          {t('verifyDoc.changedAfter', lang).replace('{date}', formatDate(printDate, lang))}
        </p>
      ) : null}
    </VerifyCard>
  )
}
