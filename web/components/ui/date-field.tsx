'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Popover } from '@base-ui/react/popover'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, localeOf, numberFmt, type Lang } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { useDialogContainer } from '@/components/native-dialog'
import { WEEKDAY_SHORT } from '@/lib/employee-attendance-calendar'
import { inputClass } from './field'
import {
  addMonths, clampIso, formatField, isDisabledDay, isValidIso, monthMatrix, moveFocus, parseIso, parseTyped, toIso,
} from '@/lib/date-field'

// The one date picker (replaces `<input type="date">`, whose popup is Chrome's
// grey English calendar). A drop-in: the value is an ISO `YYYY-MM-DD` string in
// a real hidden `<input name>`, so FormData / server actions read it unchanged.
// The visible text box carries `required` and the range check through the
// browser's own validation, so a bad or empty field blocks submit with a message.
// Dates are plain calendar dates (lib/date-field.ts) - never local-time Date.

const SCHOOL_TZ = 'Asia/Dhaka'
const FIRST_YEAR = 1950
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TZ }).format(new Date())

const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia('(max-width: 639px)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const useNarrow = () =>
  useSyncExternalStore(subscribeNarrow, () => window.matchMedia('(max-width: 639px)').matches, () => false)

export type DateFieldProps = {
  name?: string
  id?: string
  defaultValue?: string | null
  value?: string | null
  /** Called with the ISO string ('' when cleared), exactly what a native date input gives. */
  onChange?: (iso: string) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  lang?: Lang
  className?: string
  placeholder?: string
  title?: string
  /** Weekday columns (0 = Sunday) that get the weekend tint. Default: Friday. */
  weekendDays?: readonly number[]
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

export function DateField({
  name, id, defaultValue, value, onChange, min, max, required, disabled, lang: langProp, className, placeholder, title,
  weekendDays = [5], 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy,
}: DateFieldProps) {
  const hookLang = useLang()
  const lang = langProp ?? hookLang
  const dialog = useDialogContainer()
  const narrow = useNarrow()
  const controlled = value !== undefined
  const initial = (controlled ? value : defaultValue) ?? ''
  const [inner, setInner] = useState(isValidIso(initial) ? initial : '')
  const iso = controlled ? (isValidIso(value) ? (value as string) : '') : inner
  const [draft, setText] = useState('')
  const [typing, setTyping] = useState(false)
  // While typing show the keystrokes; otherwise follow the committed value and the language.
  const text = typing ? draft : formatField(iso, lang)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // <form>.reset() puts the native defaults back; do the same.
  useEffect(() => {
    const form = inputRef.current?.form
    if (!form) return
    const onReset = () => {
      setTyping(false)
      if (!controlled) setInner(isValidIso(defaultValue) ? (defaultValue as string) : '')
    }
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [controlled, defaultValue])

  const commit = (next: string) => {
    if (next === iso) return
    if (!controlled) setInner(next)
    onChange?.(next)
  }

  // What the browser's validation bubble says for what is typed right now.
  const typed = text.trim() === '' ? '' : parseTyped(text)
  const outOfRange = !!typed && isDisabledDay(typed, min, max)
  const problem = typed === null ? t('dateField.invalid', lang) : outOfRange ? t('dateField.outOfRange', lang) : ''
  useLayoutEffect(() => {
    inputRef.current?.setCustomValidity(problem)
  }, [problem])

  const onText = (v: string) => {
    setText(v)
    setTyping(true)
    const p = v.trim() === '' ? '' : parseTyped(v)
    if (p !== null && !(p && isDisabledDay(p, min, max))) commit(p)
  }
  const endTyping = () => {
    if (problem === '') setTyping(false)
  }

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) inputRef.current?.focus()
  }
  const pick = (next: string) => {
    setTyping(false)
    commit(next)
    close(true)
  }

  const hasWidth = /(^|\s)(w-|min-w-|flex-1)/.test(className ?? '')
  const showClear = !required && !disabled && iso !== ''
  const calBtnClass =
    'absolute inset-y-0 end-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed'

  const panel = (sheet: boolean) => (
    <Panel
      key={open ? 'o' : 'c'}
      sheet={sheet}
      lang={lang}
      iso={iso}
      min={min}
      max={max}
      required={!!required}
      weekendDays={weekendDays}
      label={ariaLabel ?? title ?? t('dateField.open', lang)}
      onPick={pick}
      onClose={close}
    />
  )

  return (
    <div ref={wrapRef} className={cn('relative', /(^|\s)w-full(\s|$)/.test(className ?? '') ? 'block w-full' : 'inline-block')}>
      {name && <input type="hidden" name={name} value={iso} disabled={disabled} />}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        placeholder={placeholder ?? t('dateField.placeholder', lang)}
        required={required}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={problem ? true : undefined}
        aria-haspopup="dialog"
        onChange={(e) => onText(e.target.value)}
        onBlur={endTyping}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(inputClass(), !hasWidth && 'w-44', showClear ? 'pe-[4.5rem]' : 'pe-10', problem && 'border-alert focus:border-alert', className)}
      />
      {showClear && (
        <button
          type="button"
          aria-label={t('dateField.clearDate', lang)}
          onClick={() => {
            setTyping(false)
            commit('')
            inputRef.current?.focus()
          }}
          className="absolute inset-y-0 end-10 flex w-8 cursor-pointer items-center justify-center text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-300"
        >
          <XIcon className="size-4" />
        </button>
      )}
      <Popover.Root open={open} onOpenChange={(o) => setOpen(o)} modal={false}>
        <Popover.Trigger
          disabled={disabled}
          aria-label={t('dateField.open', lang)}
          aria-expanded={open}
          className={calBtnClass}
          render={<button type="button" />}
        >
          <CalendarIcon className="size-4" />
        </Popover.Trigger>
        {open && !narrow && (
          <Popover.Portal container={dialog ?? undefined}>
            <Popover.Positioner
              anchor={wrapRef}
              side="bottom"
              align="start"
              sideOffset={4}
              collisionPadding={8}
              positionMethod={dialog ? 'fixed' : 'absolute'}
              className="z-50 outline-none"
            >
              <Popover.Popup initialFocus={false} finalFocus={false} aria-label={ariaLabel ?? t('dateField.open', lang)} className="datefield-pop rounded-xl border border-line bg-paper p-3 shadow-card outline-none">
                {panel(false)}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        )}
      </Popover.Root>
      {open && narrow && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
          <div role="dialog" aria-modal="true" aria-label={ariaLabel ?? t('dateField.open', lang)} className="datefield-sheet absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-paper p-4 pb-6 shadow-card">
            {panel(true)}
          </div>
        </div>,
        dialog ?? document.body,
      )}
    </div>
  )
}

const navBtn =
  'inline-flex size-9 max-sm:size-11 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:bg-paper-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-40'
const footBtn =
  'cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold text-brand-700 outline-none hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-40 max-sm:min-h-11'

function Panel({
  sheet, lang, iso, min, max, required, weekendDays, label, onPick, onClose,
}: {
  sheet: boolean
  lang: Lang
  iso: string
  min?: string
  max?: string
  required: boolean
  weekendDays: readonly number[]
  label: string
  onPick: (iso: string) => void
  onClose: (returnFocus: boolean) => void
}) {
  const today = todayIso()
  const start = clampIso(iso || today, min, max)
  const [focusIso, setFocusIso] = useState(start)
  const [view, setView] = useState<[number, number]>(() => parseIso(start)!.slice(0, 2) as [number, number])
  const [picker, setPicker] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const wantFocus = useRef(true)
  const titleId = useId()
  const [year, month] = view

  const loc = localeOf(lang)
  const monthName = (m: number) => new Intl.DateTimeFormat(loc, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, m - 1, 1))
  const num = (n: number, o?: Intl.NumberFormatOptions) => numberFmt(lang, { useGrouping: false, ...o }).format(n)
  const fullDate = (d: string) => {
    const p = parseIso(d)!
    return new Intl.DateTimeFormat(loc, { dateStyle: 'full', timeZone: 'UTC' }).format(Date.UTC(p[0], p[1] - 1, p[2]))
  }

  // Escape closes this popup and nothing behind it (the dialog or drawer under
  // it): caught on the way down, before any other listener sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose(true)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Roving focus: after a keyboard move or on open, put focus on the day.
  useEffect(() => {
    if (!wantFocus.current || picker) return
    wantFocus.current = false
    rootRef.current?.querySelector<HTMLElement>(`[data-iso="${focusIso}"]`)?.focus()
  })

  // Month/year chooser: show the selected year in the middle of its list.
  useEffect(() => {
    if (!picker) return
    const list = rootRef.current?.querySelector<HTMLElement>('[data-years]')
    const cur = list?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (list && cur) list.scrollTop = cur.offsetTop - list.clientHeight / 2 + cur.clientHeight / 2
  }, [picker])

  const goMonth = (n: number) => {
    const next = addMonths(toIso(year, month, 1), n)
    const p = parseIso(next)!
    setView([p[0], p[1]])
    setFocusIso(addMonths(focusIso, n))
  }

  const onGridKey = (e: React.KeyboardEvent) => {
    const next = moveFocus(focusIso, e.key, min, max)
    if (!next) return
    e.preventDefault()
    wantFocus.current = true
    setFocusIso(next)
    const p = parseIso(next)!
    setView([p[0], p[1]])
  }

  const weeks = monthMatrix(year, month)
  const yearHi = Math.max(parseIso(todayIso())![0] + 5, parseIso(max)?.[0] ?? 0, year)
  const yearLo = Math.min(FIRST_YEAR, parseIso(min)?.[0] ?? FIRST_YEAR, year)
  const years = Array.from({ length: yearHi - yearLo + 1 }, (_, i) => yearLo + i)
  const monthOut = (y: number, m: number) =>
    (!!min && addMonths(toIso(y, m, 1), 1) <= min) || (!!max && toIso(y, m, 1) > max)
  const prevOut = !!min && toIso(year, month, 1) <= min
  const nextOut = !!max && addMonths(toIso(year, month, 1), 1) > max

  return (
    <div ref={rootRef} className={cn('select-none', sheet ? 'mx-auto w-full max-w-sm' : 'w-72')}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button type="button" className={navBtn} aria-label={t('student.prevMonth', lang)} disabled={picker || prevOut} onClick={() => goMonth(-1)}>
          <ChevronLeftIcon className="size-4" />
        </button>
        <button
          type="button"
          id={titleId}
          aria-live="polite"
          aria-label={`${monthName(month)} ${num(year)}, ${t('dateField.pickMonthYear', lang)}`}
          aria-expanded={picker}
          onClick={() => {
            wantFocus.current = picker
            setPicker(!picker)
          }}
          className="cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold text-ink outline-none hover:bg-paper-muted focus-visible:ring-2 focus-visible:ring-brand-300 max-sm:min-h-11"
        >
          {monthName(month)} {num(year)}
        </button>
        <button type="button" className={navBtn} aria-label={t('student.nextMonth', lang)} disabled={picker || nextOut} onClick={() => goMonth(1)}>
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {picker ? (
        <div className="grid grid-cols-[1fr_5.5rem] gap-2" aria-label={label}>
          <div className="grid grid-cols-2 content-start gap-1" role="group" aria-label={t('dateField.month', lang)}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={m === month}
                disabled={monthOut(year, m)}
                onClick={() => {
                  setView([year, m])
                  setFocusIso(toIso(year, m, Math.min(parseIso(focusIso)![2], 28)))
                  wantFocus.current = true
                  setPicker(false)
                }}
                className={cn(
                  'cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-35 max-sm:min-h-11',
                  m === month ? 'bg-brand-600 font-semibold text-white hover:bg-brand-600' : 'text-ink',
                )}
              >
                {monthName(m)}
              </button>
            ))}
          </div>
          <div data-years role="group" aria-label={t('dateField.year', lang)} className="relative max-h-64 overflow-y-auto overscroll-contain rounded-md border border-line py-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={y === year}
                disabled={(!!min && toIso(y, 12, 31) < min) || (!!max && toIso(y, 1, 1) > max)}
                onClick={() => {
                  setView([y, month])
                  setFocusIso(clampIso(toIso(y, month, Math.min(parseIso(focusIso)![2], 28)), min, max))
                }}
                className={cn(
                  'block w-full cursor-pointer px-2 py-1.5 text-center text-sm outline-none hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-35 max-sm:min-h-11',
                  y === year ? 'bg-brand-600 font-semibold text-white hover:bg-brand-600' : 'text-ink',
                )}
              >
                {num(y)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div role="grid" aria-labelledby={titleId} aria-label={label} onKeyDown={onGridKey}>
          <div role="row" className="grid grid-cols-7">
            {WEEKDAY_SHORT.map((w) => (
              <span key={w.en} role="columnheader" className="py-1.5 text-center text-xs font-semibold text-muted">
                {w[lang]}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} role="row" className="grid grid-cols-7">
              {week.map(({ iso: d, outside }, di) => {
                const disabled = isDisabledDay(d, min, max)
                const selected = d === iso
                const isToday = d === today
                return (
                  <div key={d} role="gridcell" aria-selected={selected} className={cn('flex justify-center py-0.5', weekendDays.includes(di) && 'bg-paper-muted/50')}>
                    <button
                      type="button"
                      data-iso={d}
                      tabIndex={d === focusIso ? 0 : -1}
                      disabled={disabled}
                      aria-label={fullDate(d)}
                      aria-current={isToday ? 'date' : undefined}
                      aria-pressed={selected}
                      onClick={() => onPick(d)}
                      className={cn(
                        'inline-flex size-9 max-sm:size-11 cursor-pointer items-center justify-center rounded-full text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-300',
                        disabled ? 'cursor-not-allowed text-muted/40 line-through decoration-muted/30'
                          : isToday ? 'bg-brand-600 font-semibold text-white hover:bg-brand-700'
                          : selected ? 'bg-brand-50 font-semibold text-brand-700 ring-2 ring-brand-600'
                          : outside ? 'text-muted/60 hover:bg-paper-muted'
                          : 'text-ink hover:bg-brand-50',
                        isToday && selected && 'ring-2 ring-brand-300 ring-offset-2 ring-offset-paper',
                      )}
                    >
                      {num(parseIso(d)![2])}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <button type="button" className={footBtn} disabled={isDisabledDay(today, min, max)} onClick={() => onPick(today)}>
          {t('attendance.calendarToday', lang)}
        </button>
        {!required && (
          <button type="button" className={cn(footBtn, 'text-muted hover:bg-paper-muted')} onClick={() => onPick('')}>
            {t('dateField.clear', lang)}
          </button>
        )}
      </div>
    </div>
  )
}
