'use client'

import { useState, useTransition } from 'react'
import { inputClass, labelClass, primaryBtnClass } from '@/components/auth-card'
import { t, type Lang } from '@/lib/i18n'
import { matchesLogisticsQuery } from '@/lib/institute'
import { addLogisticsEntry, deleteLogisticsEntry, updateLogisticsEntry } from './actions'

export interface LogisticsEntry {
  id: string
  item_type: string
  year: string
  storage_location: string
  notes: string | null
}

const thClass = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted'
const tdClass = 'px-3 py-2 text-sm'

function AddDetails({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none rounded-full bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">
        {label}
      </summary>
      <div className="mt-3 rounded-md border border-line bg-paper-muted p-4">{children}</div>
    </details>
  )
}

function EntryFields({ lang, entry }: { lang: Lang; entry?: LogisticsEntry }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div>
        <label className={labelClass} htmlFor="item_type">
          {t('institute.itemType', lang)}
        </label>
        <input id="item_type" name="item_type" defaultValue={entry?.item_type} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="year">
          {t('institute.year', lang)}
        </label>
        <input id="year" name="year" defaultValue={entry?.year} required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="storage_location">
          {t('institute.storageLocation', lang)}
        </label>
        <input
          id="storage_location"
          name="storage_location"
          defaultValue={entry?.storage_location}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="notes">
          {t('institute.notes', lang)}
        </label>
        <input id="notes" name="notes" defaultValue={entry?.notes ?? ''} className={inputClass} />
      </div>
    </div>
  )
}

export function AddEntryForm({ lang }: { lang: Lang }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <AddDetails label={t('institute.addEntry', lang)}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.currentTarget
          const data = new FormData(form)
          startTransition(async () => {
            setError(null)
            const result = await addLogisticsEntry(data)
            if (result.error) setError(result.error)
            else form.reset()
          })
        }}
      >
        <EntryFields lang={lang} />
        {error && <p className="text-sm text-alert-deep">{error}</p>}
        <button type="submit" disabled={pending} className={`${primaryBtnClass} w-auto px-6`}>
          {t('institute.save', lang)}
        </button>
      </form>
    </AddDetails>
  )
}

function EntryRow({ lang, entry }: { lang: Lang; entry: LogisticsEntry }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (editing) {
    return (
      <tr className="border-b border-line">
        <td className={tdClass} colSpan={5}>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const data = new FormData(e.currentTarget)
              startTransition(async () => {
                setError(null)
                const result = await updateLogisticsEntry(entry.id, data)
                if (result.error) setError(result.error)
                else setEditing(false)
              })
            }}
          >
            <EntryFields lang={lang} entry={entry} />
            {error && <p className="text-sm text-alert-deep">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pending} className={`${primaryBtnClass} w-auto px-6`}>
                {t('institute.save', lang)}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="cursor-pointer rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold hover:bg-paper-muted"
              >
                {t('common.back', lang)}
              </button>
            </div>
          </form>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-line">
      <td className={`${tdClass} font-medium`}>{entry.item_type}</td>
      <td className={tdClass}>{entry.year}</td>
      <td className={tdClass}>{entry.storage_location}</td>
      <td className={`${tdClass} text-muted`}>{entry.notes ?? '—'}</td>
      <td className={tdClass}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="cursor-pointer rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:bg-paper-muted"
          >
            {t('institute.edit', lang)}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteLogisticsEntry(entry.id)
              })
            }
            className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft disabled:opacity-50"
          >
            {t('common.delete', lang)}
          </button>
        </div>
      </td>
    </tr>
  )
}

export function LogisticsTable({ entries, lang }: { entries: LogisticsEntry[]; lang: Lang }) {
  const [query, setQuery] = useState('')
  const visible = entries.filter((e) => matchesLogisticsQuery(e, query))

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('institute.searchLogistics', lang)}
          className={`${inputClass} max-w-xs`}
        />
        <AddEntryForm lang={lang} />
      </div>
      {!visible.length ? (
        <p className="text-sm text-muted">{t('institute.noLogistics', lang)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-strong">
                <th className={thClass}>{t('institute.itemType', lang)}</th>
                <th className={thClass}>{t('institute.year', lang)}</th>
                <th className={thClass}>{t('institute.storageLocation', lang)}</th>
                <th className={thClass}>{t('institute.notes', lang)}</th>
                <th className={thClass}>{t('institute.actions', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <EntryRow key={entry.id} lang={lang} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
