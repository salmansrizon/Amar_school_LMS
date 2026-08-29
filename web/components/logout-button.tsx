'use client'

import { useRouter } from 'next/navigation'
import { signOutAction } from '@/lib/auth/session-actions'

export function LogoutButton({
  label,
  className = 'cursor-pointer rounded-full border border-white/30 px-3 py-1 text-xs hover:bg-white/10',
  icon,
}: {
  label: React.ReactNode
  className?: string
  icon?: React.ReactNode
}) {
  const router = useRouter()
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await signOutAction()
        router.replace('/login')
      }}
    >
      {icon}
      {label}
    </button>
  )
}
