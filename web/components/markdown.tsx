import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { softBreaksToHard } from '@/lib/rich-text'

// The one renderer for a question and its reply. No raw HTML (react-markdown
// shows it as text and no rehype-raw is installed), no dangerouslySetInnerHTML,
// only http / https / mailto links, and no images: a student must not be able to
// embed a remote picture in front of a teacher.

const SAFE_URL = /^(https?:|mailto:)/i

const components: Components = {
  a: ({ href, children }) =>
    href && SAFE_URL.test(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand-600 underline break-words">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Alt text only, never a request to the image's host.
  img: ({ alt }) => <span>{alt ?? ''}</span>,
  h1: ({ children }) => <h3 className="mt-3 mb-1 text-lg font-bold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1 text-lg font-bold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-base font-bold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-2 mb-1 text-sm font-bold first:mt-0">{children}</h5>,
  h5: ({ children }) => <h5 className="mt-2 mb-1 text-sm font-bold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h5 className="mt-2 mb-1 text-sm font-bold first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-1 break-words first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-4 border-line-strong pl-3 text-muted">{children}</blockquote>,
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto rounded-md bg-paper-muted p-3 font-mono text-xs leading-relaxed">{children}</pre>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded-sm bg-paper-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto">
      <table className="border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-line px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-line px-2 py-1">{children}</td>,
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`min-w-0 text-sm ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={(url) => (SAFE_URL.test(url) ? url : '')}
      >
        {softBreaksToHard(text)}
      </ReactMarkdown>
    </div>
  )
}
