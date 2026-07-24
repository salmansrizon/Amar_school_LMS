import type { NextRequest } from 'next/server'
import { signedObjectRoute } from '@/lib/storage/signed-object'

// Supabase storage client needs Node APIs.
export const runtime = 'nodejs'

const TABLES = { voucher: 'vouchers', asset: 'assets' } as const

// Opens a voucher or asset attachment (issue #35) — private bucket, signed-URL redirect.
export const GET = signedObjectRoute((req: NextRequest) => {
  const url = new URL(req.url)
  const kind = url.searchParams.get('kind')
  const id = url.searchParams.get('id')
  if (!kind || !id || !(kind in TABLES)) return new Response('bad request', { status: 400 })
  return {
    bucket: 'accounting-attachments',
    table: TABLES[kind as keyof typeof TABLES],
    pathColumn: 'attachment_path',
    match: { id },
  }
})
