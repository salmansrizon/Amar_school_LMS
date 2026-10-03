'use client'

import { useState } from 'react'
import { t, type Lang } from '@/lib/i18n'
import { ACADEMIC_SHIFT_LABEL_KEY, isKnownAcademicShift } from '@/lib/institute'
import { machineTypeLabel, type AttendanceMachine } from '@/lib/machine-attendance'
import { Modal } from '@/components/modal'

// Machine Attendance placeholders (issue #675). Device synchronization does
// not exist yet: these components show which machine an action would target
// and then say "Upcoming". Nothing here calls a server action or an API —
// the future Windows sync service replaces the Upcoming step.

export function machineShiftLabel(machine: Pick<AttendanceMachine, 'shift_scope' | 'shift'>, lang: Lang): string | null {
  if (machine.shift_scope === 'all') return t('machine.shiftAll', lang)
  if (machine.shift_scope === 'shift' && machine.shift) {
    return isKnownAcademicShift(machine.shift) ? t(ACADEMIC_SHIFT_LABEL_KEY[machine.shift], lang) : machine.shift
  }
  return null
}

/** Everything an operator needs to tell two physical machines apart: model
 *  and vendor, serial number, location, and — highlighted — the Shift it
 *  serves. */
export function MachineIdentity({ machine, lang }: { machine: AttendanceMachine; lang: Lang }) {
  const shift = machineShiftLabel(machine, lang)
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{machine.model}</span>
        <span className="text-xs text-muted">{machineTypeLabel(machine.machine_type)}</span>
        {shift && (
          <span
            data-shift-badge
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              machine.shift_scope === 'shift' ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-600'
            }`}
          >
            {shift}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-muted">
        {t('machine.serialShort', lang)}: <span className="font-mono text-ink">{machine.serial_number}</span>
        {' · '}
        {machine.location}
      </div>
    </div>
  )
}

export function UpcomingNotice({ body, lang }: { body: string; lang: Lang }) {
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50 p-4" data-upcoming>
      <span className="inline-block rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
        {t('machine.upcoming', lang)}
      </span>
      <p className="mt-3 text-sm leading-relaxed text-ink">{body}</p>
    </div>
  )
}

/** Radio list of machines; the chosen one is outlined. */
export function MachinePickList({
  machines,
  selectedId,
  onSelect,
  lang,
}: {
  machines: AttendanceMachine[]
  selectedId: string | null
  onSelect: (id: string) => void
  lang: Lang
}) {
  if (!machines.length) return <p className="text-sm text-muted">{t('machine.pickNone', lang)}</p>
  return (
    <ul className="grid gap-2" role="radiogroup" aria-label={t('machine.pickTitle', lang)}>
      {machines.map((m) => (
        <li key={m.id}>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
              selectedId === m.id ? 'border-brand-500 ring-2 ring-brand-300' : 'border-line hover:bg-paper-muted'
            }`}
          >
            <input
              type="radio"
              name="machine"
              value={m.id}
              checked={selectedId === m.id}
              onChange={() => onSelect(m.id)}
              className="mt-1"
            />
            <MachineIdentity machine={m} lang={lang} />
          </label>
        </li>
      ))}
    </ul>
  )
}

const triggerClass =
  'cursor-pointer rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600'
const secondaryClass = 'cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-paper-muted'

/** Enroll Students / Enroll Employees: choose the target machine, then the
 *  Upcoming notice. */
export function EnrollButton({
  kind,
  machines,
  lang,
}: {
  kind: 'student' | 'employee'
  machines: AttendanceMachine[]
  lang: Lang
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [step, setStep] = useState<'pick' | 'upcoming'>('pick')
  const selected = machines.find((m) => m.id === selectedId) ?? null

  return (
    <Modal
      lang={lang}
      triggerLabel={t(kind === 'student' ? 'machine.enrollStudents' : 'machine.enrollEmployees', lang)}
      triggerClassName={triggerClass}
      title={t(step === 'pick' ? 'machine.pickTitle' : 'machine.upcoming', lang)}
      onOpenChange={(open) => {
        if (!open) {
          setStep('pick')
          setSelectedId(null)
        }
      }}
    >
      {(close) =>
        step === 'pick' ? (
          <div className="grid gap-4">
            {kind === 'employee' && (
              <p className="rounded-lg border border-sun-deep/30 bg-sun-soft p-3 text-sm font-semibold text-sun-deep">
                {t('machine.fingerprintNote', lang)}
              </p>
            )}
            <p className="text-sm text-muted">{t('machine.pickHelp', lang)}</p>
            <MachinePickList machines={machines} selectedId={selectedId} onSelect={setSelectedId} lang={lang} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} className={secondaryClass}>
                {t('machine.cancel', lang)}
              </button>
              <button
                type="button"
                disabled={!selected}
                onClick={() => setStep('upcoming')}
                className={`${triggerClass} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {t('machine.continue', lang)}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {selected && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted">{t('machine.selected', lang)}</p>
                <div className="rounded-lg border border-line p-3">
                  <MachineIdentity machine={selected} lang={lang} />
                </div>
              </div>
            )}
            <UpcomingNotice
              body={t(kind === 'student' ? 'machine.studentsUpcomingBody' : 'machine.employeesUpcomingBody', lang)}
              lang={lang}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setStep('pick')} className={secondaryClass}>
                {t('machine.back', lang)}
              </button>
              <button type="button" onClick={close} className={triggerClass}>
                {t('machine.close', lang)}
              </button>
            </div>
          </div>
        )
      }
    </Modal>
  )
}

export function DownloadServiceButton({ lang }: { lang: Lang }) {
  return (
    <Modal
      lang={lang}
      triggerLabel={t('machine.downloadService', lang)}
      triggerClassName={secondaryClass}
      title={t('machine.downloadService', lang)}
    >
      {(close) => (
        <div className="grid gap-4">
          <UpcomingNotice body={t('machine.serviceUpcomingBody', lang)} lang={lang} />
          <div className="flex justify-end">
            <button type="button" onClick={close} className={triggerClass}>
              {t('machine.close', lang)}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
