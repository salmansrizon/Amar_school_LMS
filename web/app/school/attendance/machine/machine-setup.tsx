'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { t, type Lang, type MessageKey } from '@/lib/i18n'
import { ACADEMIC_SHIFT_LABEL_KEY, type AcademicShift } from '@/lib/institute'
import {
  DEFAULT_MACHINE_PORT,
  MACHINE_TYPES,
  activeMachines,
  machineShiftChoice,
  machineTypeLabel,
  type AttendanceMachine,
} from '@/lib/machine-attendance'
import { inputClass, labelClass } from '@/components/auth-card'
import { selectClass } from '@/components/ui/field'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteMachineAction, saveMachineAction, setMachineArchivedAction } from './actions'
import { machineShiftLabel } from './machine-ui'

// Machine Setup (issue #675): one form that adds a machine, or edits the one
// picked from the table below it, plus the table itself. A machine that has
// been used is archived rather than deleted (ADR 0033); archived machines are
// listed separately and can be restored.

const ERROR_KEYS: Record<string, MessageKey> = {
  errMachineType: 'machine.errMachineType',
  errModel: 'machine.errModel',
  errSerial: 'machine.errSerial',
  errLocation: 'machine.errLocation',
  errShift: 'machine.errShift',
  errHost: 'machine.errHost',
  errPort: 'machine.errPort',
  errMachineInUse: 'machine.errMachineInUse',
  errMachineArchived: 'machine.errMachineArchived',
  errMachineReplaced: 'machine.errMachineReplaced',
  errSerialTaken: 'machine.errSerialTaken',
  errNotFound: 'machine.errNotFound',
  errSave: 'machine.errSave',
}

function errorMessage(code: string, lang: Lang): string {
  return code in ERROR_KEYS ? t(ERROR_KEYS[code]!, lang) : t('machine.errSave', lang)
}

const buttonClass =
  'cursor-pointer rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50'
const secondaryClass = 'cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-paper-muted'

export function MachineSetup({
  machines,
  configuredShifts,
  lang,
}: {
  machines: AttendanceMachine[]
  configuredShifts: readonly AcademicShift[]
  lang: Lang
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [editing, setEditing] = useState<AttendanceMachine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [restoreError, setRestoreError] = useState<{ id: string; message: string } | null>(null)
  const active = activeMachines(machines)
  const archived = machines.filter((m) => m.archived_at !== null)

  function restore(machine: AttendanceMachine) {
    startTransition(async () => {
      const result = await setMachineArchivedAction(machine.id, false)
      if (result.error) {
        setRestoreError({ id: machine.id, message: errorMessage(result.error, lang) })
        return
      }
      setRestoreError(null)
      router.refresh()
    })
  }

  function startEdit(machine: AttendanceMachine) {
    setEditing(machine)
    setError(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function stopEdit() {
    setEditing(null)
    setError(null)
    formRef.current?.reset()
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveMachineAction(editing?.id ?? null, formData)
      if (result.error) {
        setError(result.error)
        return
      }
      stopEdit()
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6">
      <form
        ref={formRef}
        // Re-mount on edit/new so every field takes its new defaultValue.
        key={editing?.id ?? 'new'}
        action={submit}
        className="grid gap-4 rounded-lg border border-line bg-paper p-5"
      >
        <h2 className="text-base font-bold">{t(editing ? 'machine.editTitle' : 'machine.addTitle', lang)}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="machine_type" className={labelClass}>
              {t('machine.type', lang)}
            </label>
            <select
              id="machine_type"
              name="machine_type"
              defaultValue={editing?.machine_type ?? MACHINE_TYPES[0].value}
              className={selectClass({ size: 'md', fullWidth: true })}
            >
              {MACHINE_TYPES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="model" className={labelClass}>
              {t('machine.model', lang)}
            </label>
            <input id="model" name="model" required placeholder="K40" defaultValue={editing?.model} className={inputClass} />
          </div>
          <div>
            <label htmlFor="serial_number" className={labelClass}>
              {t('machine.serial', lang)}
            </label>
            <input
              id="serial_number"
              name="serial_number"
              required
              autoComplete="off"
              defaultValue={editing?.serial_number}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="location" className={labelClass}>
              {t('machine.location', lang)}
            </label>
            <input
              id="location"
              name="location"
              required
              placeholder={t('machine.locationPlaceholder', lang)}
              defaultValue={editing?.location}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="shift" className={labelClass}>
              {t('machine.shift', lang)}
            </label>
            {/* A School with no Shifts gets no choice to make — and no
                pretend "General" Shift (issue #675). */}
            {configuredShifts.length ? (
              <select
                id="shift"
                name="shift"
                defaultValue={editing ? machineShiftChoice(editing) : 'all'}
                className={selectClass({ size: 'md', fullWidth: true })}
              >
                <option value="all">{t('machine.shiftAll', lang)}</option>
                {configuredShifts.map((s) => (
                  <option key={s} value={s}>
                    {t(ACADEMIC_SHIFT_LABEL_KEY[s], lang)}
                  </option>
                ))}
                <option value="">{t('machine.shiftNone', lang)}</option>
              </select>
            ) : (
              <>
                <input type="hidden" name="shift" value="" />
                <p className="flex h-10 items-center text-sm text-muted">{t('machine.shiftNone', lang)}</p>
              </>
            )}
          </div>
          <div>
            <label htmlFor="host" className={labelClass}>
              {t('machine.host', lang)}
            </label>
            <input
              id="host"
              name="host"
              autoComplete="off"
              placeholder="192.168.0.201"
              defaultValue={editing?.host ?? ''}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="port" className={labelClass}>
              {t('machine.port', lang)}
            </label>
            <input
              id="port"
              name="port"
              inputMode="numeric"
              autoComplete="off"
              placeholder={String(DEFAULT_MACHINE_PORT.zkteco)}
              defaultValue={editing?.port ?? ''}
              className={`${inputClass} font-mono`}
            />
            <p className="mt-1 text-xs text-muted">{t('machine.portHint', lang)}</p>
          </div>
        </div>
        <div>
          <label htmlFor="note" className={labelClass}>
            {t('machine.note', lang)}
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            placeholder={t('machine.notePlaceholder', lang)}
            defaultValue={editing?.note ?? ''}
            className={`${inputClass} h-auto py-2`}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-semibold text-alert-deep">
            {errorMessage(error, lang)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {editing && (
            <button type="button" onClick={stopEdit} className={secondaryClass}>
              {t('machine.cancel', lang)}
            </button>
          )}
          <button type="submit" disabled={pending} className={buttonClass}>
            {t(editing ? 'machine.saveChanges' : 'machine.add', lang)}
          </button>
        </div>
      </form>

      <section>
        <h2 className="mb-2 text-base font-bold">{t('machine.listTitle', lang)}</h2>
        {active.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-paper p-6 text-center">
            <p className="font-semibold">{t('machine.none', lang)}</p>
            <p className="mt-1 text-sm text-muted">{t('machine.noneBody', lang)}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full text-sm">
              <thead className="bg-paper-muted text-left text-xs font-semibold text-muted">
                <tr>
                  <th className="px-3 py-2">{t('machine.type', lang)}</th>
                  <th className="px-3 py-2">{t('machine.model', lang)}</th>
                  <th className="px-3 py-2">{t('machine.serialShort', lang)}</th>
                  <th className="px-3 py-2">{t('machine.location', lang)}</th>
                  <th className="px-3 py-2">{t('machine.shift', lang)}</th>
                  <th className="px-3 py-2 text-right">{t('machine.actions', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {active.map((m) => (
                  <tr key={m.id} className={`border-t border-line ${editing?.id === m.id ? 'bg-brand-50' : ''}`}>
                    <td className="px-3 py-2">{machineTypeLabel(m.machine_type)}</td>
                    <td className="px-3 py-2 font-semibold">{m.model}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {m.serial_number}
                      {m.host && (
                        <p className="mt-0.5 text-muted">
                          {m.host}:{m.port}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {m.location}
                      {m.note && <p className="mt-0.5 max-w-xs truncate text-xs text-muted">{m.note}</p>}
                    </td>
                    <td className="px-3 py-2">{machineShiftLabel(m, lang) ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"
                        >
                          {t('machine.edit', lang)}
                        </button>
                        <ConfirmDialog
                          triggerLabel={t('machine.archive', lang)}
                          triggerClassName="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-muted hover:bg-paper-muted"
                          title={t('machine.archiveTitle', lang)}
                          body={t('machine.archiveBody', lang)}
                          confirmLabel={t('machine.archive', lang)}
                          cancelLabel={t('machine.cancel', lang)}
                          onConfirm={async () => {
                            const result = await setMachineArchivedAction(m.id, true)
                            if (result.error) return { error: errorMessage(result.error, lang) }
                            if (editing?.id === m.id) stopEdit()
                            router.refresh()
                          }}
                        />
                        <ConfirmDialog
                          triggerLabel={t('machine.delete', lang)}
                          triggerClassName="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-alert-deep hover:bg-alert-soft"
                          title={t('machine.deleteTitle', lang)}
                          body={t('machine.deleteBody', lang)}
                          confirmLabel={t('machine.delete', lang)}
                          cancelLabel={t('machine.cancel', lang)}
                          onConfirm={async () => {
                            const result = await deleteMachineAction(m.id)
                            if (result.error) return { error: errorMessage(result.error, lang) }
                            if (editing?.id === m.id) stopEdit()
                            router.refresh()
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-bold">{t('machine.archivedTitle', lang)}</h2>
          <p className="mb-2 text-sm text-muted">{t('machine.archivedIntro', lang)}</p>
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full text-sm">
              <tbody>
                {archived.map((m) => (
                  <tr key={m.id} className="border-t border-line text-muted first:border-t-0">
                    <td className="px-3 py-2">{machineTypeLabel(m.machine_type)}</td>
                    <td className="px-3 py-2 font-semibold">{m.model}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.serial_number}</td>
                    <td className="px-3 py-2">{m.location}</td>
                    <td className="px-3 py-2">
                      {restoreError?.id === m.id && (
                        <p role="alert" className="mb-1 text-right text-xs font-semibold text-alert-deep">
                          {restoreError.message}
                        </p>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => restore(m)}
                          className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                        >
                          {t('machine.restore', lang)}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
