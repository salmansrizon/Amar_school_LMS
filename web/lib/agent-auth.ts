import { NextResponse } from 'next/server'
import { createClient, type PostgrestError } from '@supabase/supabase-js'

// Attendance Agent API (/api/agent/v1, Machine Attendance Phase 6; ADR 0033,
// Baseline §18.1, §22.1). Credential PARSING only — verification stays in SQL
// (_attendance_agent_for_credential, migration 0221): the route never sees a
// hash, never decides who the Agent is, and never takes a School id from the
// caller. Every Agent call is an anon-client definer RPC, the same no
// service-role convention as the ingest route.
//
// Nothing here logs or echoes a credential, an activation code or a request
// body: error responses carry fixed messages only.

/** agt_<prefix>_<secret>, the shape 0221 accepts. */
const BEARER = /^Bearer (agt_[A-Za-z0-9]{8,32}_\S{16,255})$/

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The Agent credential from `Authorization: Bearer agt_…`, or null if absent/malformed. */
export function agentCredential(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  return BEARER.exec(header)?.[1] ?? null
}

export function agentDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
}

export function jsonError(status: number, error: string, headers?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store', ...headers } })
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

export const unauthorized = () => jsonError(401, 'invalid agent credential', { 'www-authenticate': 'Bearer' })

/**
 * Reads a JSON object body of at most `maxBytes`. Returns the object, or a
 * ready error response (400 invalid JSON / not an object, 413 too large).
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes) return { response: jsonError(413, 'request too large') }
  let text: string
  try {
    text = await request.text()
  } catch {
    return { response: jsonError(400, 'invalid JSON') }
  }
  if (new TextEncoder().encode(text).length > maxBytes) return { response: jsonError(413, 'request too large') }
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    return { response: jsonError(400, 'invalid JSON') }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { response: jsonError(400, 'invalid request') }
  return { body: body as Record<string, unknown> }
}

/**
 * Maps a definer-RPC error to an HTTP response by the fixed messages the
 * Phase 3/6 functions raise. Anything unexpected is a 500 with no detail —
 * a database message never reaches the Agent.
 */
export function rpcError(error: PostgrestError) {
  const m = error.message
  if (/invalid agent credential/.test(m)) return unauthorized()
  if (/invalid activation code/.test(m)) return jsonError(401, 'invalid activation code')
  if (/agent installation conflict/.test(m)) return jsonError(409, 'agent installation conflict')
  if (/credential prefix taken/.test(m)) return jsonError(409, 'credential prefix taken')
  if (/credential rotation in progress/.test(m)) return jsonError(409, 'credential rotation in progress')
  if (/attendance machine not found|machine command not found/.test(m)) return jsonError(404, 'not found')
  if (/^invalid |max_commands must be|status must be/.test(m)) return jsonError(400, 'invalid request')
  return jsonError(500, 'internal error')
}

/** Optional bounded string field; undefined when absent, null when the type is wrong. */
export function optionalString(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' && value.length <= max ? value : null
}
