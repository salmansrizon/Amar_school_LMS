import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// No @tailwindcss/typography plugin in this codebase (ADR 0006 — Tailwind
// utilities, not extra design-system layers) — style each markdown element
// explicitly instead of leaning on a `prose` class.
const COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="mb-2 mt-4 text-base font-extrabold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-extrabold first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-1 mt-3 text-sm font-bold first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline hover:text-brand-700">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-line-strong pl-3 text-muted last:mb-0">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-paper-muted px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line-strong py-1 pr-3 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-line py-1 pr-3">{children}</td>,
  hr: () => <hr className="my-3 border-line" />,
}

/** Renders agreement-version body text as Markdown (GFM: tables, strikethrough,
 *  task lists). Body is stored as plain markdown source, not HTML — no
 *  dangerouslySetInnerHTML anywhere in this path. */
export function AgreementMarkdown({ children }: { children: string }) {
  return (
    <div className="max-w-prose text-sm text-muted">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
