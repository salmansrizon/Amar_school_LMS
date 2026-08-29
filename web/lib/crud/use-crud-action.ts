'use client'

import { useState, useTransition } from 'react'

// Shared client-side plumbing for config-CRUD forms (#284 arch pass). Collapses
// the repeated { error, pending, onSubmit/run } boilerplate every CRUD form had.
// - onSubmit: wire to <form onSubmit>; reads the form's FormData, resets on success.
// - run: imperative trigger for buttons (toggle/delete) that build their own FormData.
export function useCrudAction(
  action: (formData: FormData) => Promise<{ error?: string }>,
  opts: { resetOnSuccess?: boolean } = {},
) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    startTransition(async () => {
      setError(null)
      const res = await action(data)
      if (res.error) setError(res.error)
      else if (opts.resetOnSuccess) form.reset()
    })
  }

  function run(data: FormData, onOk?: () => void) {
    startTransition(async () => {
      setError(null)
      const res = await action(data)
      if (res.error) setError(res.error)
      else onOk?.()
    })
  }

  return { error, pending, onSubmit, run }
}
