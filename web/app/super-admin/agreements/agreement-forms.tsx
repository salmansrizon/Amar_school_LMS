'use client'

import { useState, useTransition } from 'react'
import { createAgreementVersion, deleteAgreementVersion, updateAgreementVersion, recordDistributorAcceptance } from './actions'
import { AgreementMarkdown } from './agreement-markdown'

const input =
  'w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

const MARKDOWN_HINT = 'Markdown supported — **bold**, - lists, [link](url), > quote, | tables |'

export function AddVersionForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          const res = await createAgreementVersion(data)
          if (res.error) setError(res.error)
          else form.reset()
        })
      }}
    >
      <div>
        <textarea name="body" required rows={4} placeholder="Agreement text" className={input} />
        <p className="mt-1 text-xs text-muted">{MARKDOWN_HINT}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-muted">Effective from</label>
        <input type="date" name="effective_from" className={`${input} w-auto`} />
        <button
          type="submit"
          disabled={pending}
          className="ml-auto rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          Publish new version
        </button>
      </div>
      {error && <p className="text-sm text-alert-deep">{error}</p>}
    </form>
  )
}

function DeleteVersionButton({ version }: { version: number }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const data = new FormData()
          data.set('version', String(version))
          startTransition(async () => {
            setError(null)
            const res = await deleteAgreementVersion(data)
            if (res.error) setError(res.error)
          })
        }}
        className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
      >
        Delete
      </button>
      {error && <span className="text-xs text-alert-deep">{error}</span>}
    </span>
  )
}

/** One version's row: header (label + Edit/Delete or the locked note) with
 *  the body underneath, rendered as Markdown — or, while editing, replaced
 *  in place by the edit form (same "row becomes its own form" pattern as
 *  institute/venues' EditToggle). Edit/Delete are only offered pre-acceptance;
 *  once any distributor has accepted a version it's a legal record of what
 *  they agreed to, so both actions lock — enforced again server-side
 *  regardless of what this component chooses to render. */
export function AgreementVersionRow({
  version,
  body,
  effectiveFrom,
  acceptedCount,
  deletable,
}: {
  version: number
  body: string
  effectiveFrom: string
  acceptedCount: number
  deletable: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <li className="rounded-lg border border-line p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold">
          v{version}
          <span className="ml-2 text-xs font-normal text-muted">
            from {new Date(effectiveFrom).toLocaleDateString('en-GB')} · {acceptedCount} accepted
          </span>
        </span>
        {deletable ? (
          <span className="flex items-center gap-2">
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
              >
                Edit
              </button>
            )}
            <DeleteVersionButton version={version} />
          </span>
        ) : (
          <span className="text-xs text-muted">accepted — locked</span>
        )}
      </div>
      {editing ? (
        <form
          className="space-y-3 rounded-md border border-line bg-paper-muted p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            data.set('version', String(version))
            startTransition(async () => {
              setError(null)
              const res = await updateAgreementVersion(data)
              if (res.error) setError(res.error)
              else setEditing(false)
            })
          }}
        >
          <div>
            <textarea name="body" required rows={4} defaultValue={body} className={input} />
            <p className="mt-1 text-xs text-muted">{MARKDOWN_HINT}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted">Effective from</label>
            <input type="date" name="effective_from" required defaultValue={effectiveFrom} className={`${input} w-auto`} />
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="cursor-pointer rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-alert-deep">{error}</p>}
        </form>
      ) : (
        <AgreementMarkdown>{body}</AgreementMarkdown>
      )}
    </li>
  )
}

const select =
  'w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

/** Records that a distributor accepted a version — for offline/paper-signed
 *  agreements, so their acceptance still ends up in the same legal record as
 *  a real self-service acceptance (accept_agreement RPC, migration 0101,
 *  already authorizes a super_admin caller to do this; see
 *  recordDistributorAcceptance's own comment for why). Not a substitute for
 *  self-service — it's the fallback for when self-service isn't how it
 *  actually happened. */
export function RecordAcceptanceForm({
  distributors,
  versions,
}: {
  distributors: { id: string; name: string }[]
  versions: number[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!distributors.length || !versions.length) {
    return <p className="text-sm text-muted">Need at least one distributor and one published version.</p>
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const data = new FormData(form)
        startTransition(async () => {
          setError(null)
          setSuccess(false)
          const res = await recordDistributorAcceptance(data)
          if (res.error) setError(res.error)
          else setSuccess(true)
        })
      }}
    >
      <div className="min-w-48">
        <label className="mb-1 block text-xs font-semibold text-muted">Distributor</label>
        <select name="distributor_id" required className={select}>
          {distributors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Version</label>
        <select name="version" required defaultValue={versions[0]} className={select}>
          {versions.map((v) => (
            <option key={v} value={v}>
              v{v}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        Record acceptance
      </button>
      {success && !error && <span className="text-sm text-mint-deep">Recorded.</span>}
      {error && <span className="text-sm text-alert-deep">{error}</span>}
    </form>
  )
}
