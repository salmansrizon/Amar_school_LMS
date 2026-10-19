// Public verification of printed documents: the request half. One place builds
// the QR for every print (the pure URL rules live in lib/print-verify.ts).
import { cache } from 'react'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { renderPrintQr } from '@/lib/qr'
import { buildVerifyUrl, isStudentKind, printDateStamp, type PrintKind } from '@/lib/print-verify'

export interface PrintQrTarget {
  kind: PrintKind
  /** The record behind the document: exam, fee record or class offering. */
  refId?: string | null
  /** Student kinds, owner side: whose document this is. */
  studentId?: string
  /** Student kinds, when the caller already holds the token (batch prints). */
  token?: string | null
  /** Student kinds, student portal: the signed-in Student's own token. */
  self?: boolean
}

// Each lookup returns null on ANY failure, on purpose. Before migration 0260
// schools.public_token and print_tokens_self() do not exist (the same
// "column/function missing" case lib/leave-columns.ts and
// lib/school/attendance-rate-source.ts handle), and a print must never fail
// because its QR could not be built: it falls back to the labelled box.

/** The caller's own school token. RLS scopes `schools` to one row. */
const schoolToken = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from('schools').select('public_token').maybeSingle()
  return (data as { public_token?: string } | null)?.public_token ?? null
})

/** The signed-in Student's own token and current class offering (0260). */
export const printSelfIdentity = cache(async (): Promise<{ token: string | null; classOfferingId: string | null }> => {
  const supabase = await createClient()
  const { data } = await supabase.rpc('print_tokens_self')
  const row = (data as { student_token: string; class_offering_id: string | null }[] | null)?.[0]
  return { token: row?.student_token ?? null, classOfferingId: row?.class_offering_id ?? null }
})

/** Tokens for a batch of students in one query (print-all, 200 ids a page). */
export async function studentPrintTokens(studentIds: string[]): Promise<Map<string, string>> {
  const supabase = await createClient()
  const out = new Map<string, string>()
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data } = await supabase.from('students').select('id, public_token').in('id', studentIds.slice(i, i + 200))
    for (const s of data ?? []) out.set(s.id, s.public_token)
  }
  return out
}

async function tokenFor(target: PrintQrTarget): Promise<string | null> {
  if (target.token !== undefined) return target.token
  if (!isStudentKind(target.kind)) return schoolToken()
  if (target.self) return (await printSelfIdentity()).token
  if (!target.studentId) return null
  return (await studentPrintTokens([target.studentId])).get(target.studentId) ?? null
}

/** The verification QR for one print as an SVG string, or '' when no working
 *  link can be built yet. The link is absolute, from the request host, so it
 *  works on any tenant subdomain (same as the student ID card). */
export async function printVerifyQr(target: PrintQrTarget): Promise<string> {
  const [token, h] = await Promise.all([tokenFor(target), headers()])
  const url = buildVerifyUrl({
    origin: `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`,
    kind: target.kind,
    token,
    ref: target.refId,
    printDate: printDateStamp(),
  })
  return url ? renderPrintQr(url) : ''
}
