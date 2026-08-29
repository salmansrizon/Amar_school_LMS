import { NextResponse } from 'next/server'
import { cronClient, isCronAuthorized, reconcileSecret } from '@/lib/cron/job'

// Monthly recurring subscription billing (map #258, #269/#271). A Vercel cron
// bills every school once for the current period (student-count priced); the
// sweep dedups via subscription_billing_runs.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const { data, error } = await cronClient().rpc('subscription_billing_sweep', {
    job_secret: reconcileSecret(),
    p_period: period,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ period, billed: data })
}
