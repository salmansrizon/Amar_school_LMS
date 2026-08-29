'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang } from '@/lib/i18n'
import { setTaskDone } from '@/lib/student/tasks-source'

// The Student's own tick (#446). Not a submission — real homework upload is
// #448 — so the label says so and the teacher's roster repeats it.
export function TaskToggle({
  lang,
  taskId,
  done,
  disabled,
}: {
  lang: Lang
  taskId: string
  done: boolean
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="shrink-0">
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await setTaskDone(taskId, !done)
            if (result.error) setError(result.error)
            else router.refresh()
          })
        }
        className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
          done
            ? 'border-mint bg-mint-soft text-mint-deep'
            : 'border-line-strong hover:bg-paper-muted'
        }`}
      >
        {done ? `✓ ${t('student.taskDone', lang)}` : t('student.markDone', lang)}
      </button>
      {error && <span className="ml-2 text-xs text-alert-deep">{error}</span>}
    </span>
  )
}
