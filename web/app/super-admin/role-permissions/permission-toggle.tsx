'use client'

import { MatrixToggle } from '@/components/matrix-toggle'
import { setRolePermission } from './actions'

// One matrix cell (#295): toggles the grant via the shared MatrixToggle.
export function PermissionToggle({
  roleKey,
  permissionKey,
  granted,
}: {
  roleKey: string
  permissionKey: string
  granted: boolean
}) {
  return (
    <MatrixToggle
      on={granted}
      fields={{ role_key: roleKey, permission_key: permissionKey }}
      action={setRolePermission}
      ariaLabel={`${granted ? 'Revoke' : 'Grant'} ${permissionKey} for ${roleKey}`}
    />
  )
}
