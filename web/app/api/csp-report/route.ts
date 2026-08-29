import { NextResponse } from 'next/server'

// CSP violation sink (#528). Deliberately four lines and no storage: Vercel logs
// are the dashboard, and a violation UI is a project, not a release gate. The
// point of the report-only phase is to find which directives this app actually
// trips — print views and private images especially — before enforcing.
export async function POST(request: Request) {
  const body = await request.text()
  console.error('[csp-report]', body.slice(0, 4000))
  return new NextResponse(null, { status: 204 })
}
