'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      className="cursor-pointer rounded-full border border-white/30 px-3 py-1 text-xs hover:bg-white/10"
      onClick={async () => {
        await createClient().auth.signOut()
        router.replace('/login')
      }}
    >
      {label}
    </button>
  )
}
