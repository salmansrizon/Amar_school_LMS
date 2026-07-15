import Link from 'next/link'
import type { ComponentProps } from 'react'

// Shared button primitive. Every button built with this keeps a stable footprint
// when its label changes (e.g. bn/en): the text never wraps and the control keeps
// a consistent min-height, so switching language cannot resize or reflow it.
// Use `Button` for actions and `ButtonLink` for navigation.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-line-strong bg-paper text-ink hover:border-brand-300',
  ghost: 'text-muted hover:bg-brand-50 hover:text-brand-600',
  danger: 'bg-alert text-white hover:bg-alert-deep',
}

const SIZE: Record<Size, string> = {
  sm: 'min-h-9 gap-1.5 px-3 text-xs',
  md: 'min-h-11 gap-2 px-4 text-sm',
}

export function buttonClass(opts: { variant?: Variant; size?: Size; fullWidth?: boolean } = {}) {
  const { variant = 'primary', size = 'md', fullWidth = false } = opts
  return [
    'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl font-semibold transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    SIZE[size],
    VARIANT[variant],
    fullWidth ? 'w-full' : '',
  ].join(' ')
}

type CommonProps = { variant?: Variant; size?: Size; fullWidth?: boolean }

export function Button({
  variant,
  size,
  fullWidth,
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & CommonProps) {
  return <button type={type} className={`${buttonClass({ variant, size, fullWidth })} ${className}`} {...props} />
}

export function ButtonLink({
  variant,
  size,
  fullWidth,
  className = '',
  ...props
}: ComponentProps<typeof Link> & CommonProps) {
  return <Link className={`${buttonClass({ variant, size, fullWidth })} ${className}`} {...props} />
}
