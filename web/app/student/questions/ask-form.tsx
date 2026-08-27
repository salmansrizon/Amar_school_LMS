'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { askQuestion } from '@/lib/student/messages-source'

const ERRORS: Record<string, MessageKey> = {
  anchorRequired: 'student.anchorRequired',
  subjectRequired: 'student.subjectRequired',
  bodyRequired: 'student.bodyRequired',
}

/** Asking a question (#454).
 *
 *  Either anchored to a post — the "Ask about this" affordance passes
 *  publicationId — or general, in which case a subject must be picked. A
 *  question with neither anchor has nowhere to file in the teacher's grouped
 *  inbox, which is why the form insists. */
export function AskForm({
  lang,
  publicationId,
  subjects,
}: {
  lang: Lang
  publicationId?: string
  subjects?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        if (publicationId) data.set('publication_id', publicationId)
        startTransition(async () => {
          setError(null)
          setSent(false)
          const result = await askQuestion(data)
          if (result.error) setError(ERRORS[result.error] ? t(ERRORS[result.error], lang) : result.error)
          else {
            setSent(true)
            form.reset()
            router.refresh()
          }
        })
      }}
    >
      {!publicationId && subjects && (
        <label className="text-xs font-semibold text-muted">
          <span className="mb-1 block">{t('student.pickSubject', lang)}</span>
          <select
            name="subject_id"
            required
            defaultValue=""
            className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
          >
            <option value="" disabled>
              —
            </option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">{t('student.questionSubject', lang)}</span>
        <input
          name="subject"
          required
          maxLength={120}
          className="h-9 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm"
        />
      </label>

      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">{t('student.questionBody', lang)}</span>
        <textarea
          name="body"
          required
          rows={3}
          className="w-full rounded-sm border border-line-strong bg-paper p-2 text-sm"
        />
      </label>

      {error && <p className="text-sm text-alert-deep">{error}</p>}
      {/* A bare ✓ was the only thing telling a student their question had gone
          anywhere — and from a notice or a task there was no way to reach the
          answer later either. */}
      {sent && (
        <p className="text-sm text-mint-deep">
          {t('student.questionSent', lang)}{' '}
          {publicationId && (
            <Link href="/student/questions" className="font-semibold underline">
              {t('student.seeQuestions', lang)}
            </Link>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer justify-self-start rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {t('student.send', lang)}
      </button>
    </form>
  )
}
