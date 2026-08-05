'use client'

import { useState, useTransition } from 'react'
import { setRolePermission } from './actions'

// One matrix cell (#295): click toggles the grant. Optimistic; reverts on error.
export function PermissionToggle({
  roleKey,
  permissionKey,
  granted,
}: {
  roleKey: string
  permissionKey: string
  granted: boolean
}) {
  const [on, setOn] = useState(granted)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    const data = new FormData()
    data.set('role_key', roleKey)
    data.set('permission_key', permissionKey)
    data.set('granted', String(next))
    startTransition(async () => {
      const res = await setRolePermission(data)
      if (res.error) setOn(!next) // revert
    })
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      aria-pressed={on}
      aria-label={`${on ? 'Revoke' : 'Grant'} ${permissionKey} for ${roleKey}`}
      className={`grid size-7 place-items-center rounded-md text-sm font-bold transition disabled:opacity-50 ${
        on ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'text-line-strong hover:bg-paper-muted'
      }`}
    >
      {on ? '✓' : '·'}
    </button>
  )
}
