'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { askQuestion } from '@/lib/student/messages-source'
import { ComboboxField } from '@/components/ui/combobox-field'
import { RichTextField } from '@/components/rich-text-field'
import { QUESTION_BODY_MAX } from '@/lib/student/messages'

const ERRORS: Record<string, MessageKey> = {
  anchorRequired: 'student.anchorRequired',
  subjectRequired: 'student.subjectRequired',
  bodyRequired: 'student.bodyRequired',
  bodyTooLong: 'student.bodyTooLong',
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
  // ComboboxField holds its picked item as its own internal state; unlike a
  // native `<select>`, form.reset() below clears the hidden input but not
  // that internal display state, so a remount (via key) is what actually
  // clears the picker between one question and the next.
  const [subjectFieldKey, setSubjectFieldKey] = useState(0)

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
            setSubjectFieldKey((k) => k + 1)
            router.refresh()
          }
        })
      }}
    >
      {/* No subjects assigned. The picker used to render as a `required` select
          holding only a disabled placeholder, so the child could not choose and
          could not send — with nothing saying why.
          
          An anchorless question genuinely cannot be sent: ADR 0018 makes the
          anchor the thing that authorises a reply, and both validateQuestion and
          a check constraint on student_messages enforce it. So this does not let
          the question through — an earlier version of this branch said it did,
          which would have turned a dead end at the select into a dead end after
          the child had typed the whole question. It sends them where asking
          actually works instead (#535). */}
      {!publicationId && subjects && subjects.length === 0 && (
        <div className="rounded-sm border border-line bg-paper-muted p-3 text-xs">
          <p className="text-muted">{t('student.noSubjectsYet', lang)}</p>
          <span className="mt-2 flex gap-3">
            <Link href="/student/notices" className="inline-flex items-center font-semibold text-brand-600 hover:underline max-sm:min-h-11">
              {t('student.noticesTitle', lang)}
            </Link>
            <Link href="/student/tasks" className="inline-flex items-center font-semibold text-brand-600 hover:underline max-sm:min-h-11">
              {t('student.tasksTitle', lang)}
            </Link>
          </span>
        </div>
      )}

      {!publicationId && subjects && subjects.length > 0 && (
        <label className="text-xs font-semibold text-muted">
          <span className="mb-1 block">{t('student.pickSubject', lang)}</span>
          <ComboboxField
            key={subjectFieldKey}
            name="subject_id"
            required
            defaultValue=""
            options={[
              { value: '', label: '—', disabled: true },
              ...subjects.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </label>
      )}

      <label className="text-xs font-semibold text-muted">
        <span className="mb-1 block">{t('student.questionSubject', lang)}</span>
        <input
          name="subject"
          required
          maxLength={120}
          className="h-11 w-full rounded-sm border border-line-strong bg-paper px-2 text-sm sm:h-9"
        />
      </label>

      <RichTextField key={subjectFieldKey} name="body" label={t('student.questionBody', lang)} lang={lang} maxLength={QUESTION_BODY_MAX} />

      {error && <p className="text-sm text-alert-deep">{error}</p>}
      {/* A bare ✓ was the only thing telling a student their question had gone
          anywhere — and from a notice or a task there was no way to reach the
          answer later either. */}
      {sent && (
        <p className="text-sm text-mint-deep">
          {t('student.questionSent', lang)}{' '}
          {publicationId && (
            <Link href="/student/questions" className="inline-flex items-center font-semibold underline max-sm:min-h-11">
              {t('student.seeQuestions', lang)}
            </Link>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer justify-self-start rounded-full bg-brand-500 px-5 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50 max-sm:min-h-11"
      >
        {t('student.send', lang)}
      </button>
    </form>
  )
}
