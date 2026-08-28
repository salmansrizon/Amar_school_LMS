import Link from 'next/link'

/** What a print route shows when there is nothing worth printing yet.
 *
 *  A print page that renders its branded header, its column titles and no rows is
 *  the worst of the three possible answers: it looks like a finished document, so
 *  the operator prints it, hands it out, and only then discovers the routine was
 *  never built. The UAT pass hit exactly this on the exam routine (#532).
 *
 *  A 404 is the other wrong answer — it says the page does not exist when what is
 *  missing is the data. Say which, and link to where it gets fixed. */
export function PrintPreflight({
  title,
  explanation,
  action,
  children,
}: {
  title: string
  explanation: string
  action?: { href: string; label: string }
  /** Optional chooser — used where what is missing is a selection, not data. */
  children?: React.ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <div className="rounded-lg border border-line bg-paper p-6">
        <h1 className="mb-2 text-lg font-bold">{title}</h1>
        <p className="text-sm text-muted">{explanation}</p>
        {children}
        {action && (
          <Link
            href={action.href}
            className="mt-4 inline-flex rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
          >
            {action.label}
          </Link>
        )}
      </div>
    </main>
  )
}
