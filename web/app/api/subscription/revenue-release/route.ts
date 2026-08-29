import { NextResponse } from 'next/server'
import { cronClient, isCronAuthorized, reconcileSecret } from '@/lib/cron/job'

// Monthly vendor revenue recognition. Billing issues the invoice first; this
// separate run releases the current service month from deferred revenue.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const now = new Date()
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
  const { data, error } = await cronClient().rpc('vendor_revenue_release', {
    p_period: period,
    job_secret: reconcileSecret(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ period, released: data })
}
