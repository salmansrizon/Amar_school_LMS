'use client'

import { useRouter } from 'next/navigation'
import { MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type RowMenuItem = { label: string; href: string; tone?: 'danger' }

export function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const router = useRouter()
  if (!items.length) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className="inline-flex size-9 max-sm:size-11 items-center justify-center rounded-full text-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <MoreVertical className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((i) => (
          <DropdownMenuItem
            key={i.href}
            onClick={() => router.push(i.href)}
            className={i.tone === 'danger' ? 'text-alert-deep' : undefined}
          >
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
