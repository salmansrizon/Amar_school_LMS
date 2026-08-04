import type { MessageKey } from '@/lib/i18n'

// Quick-link nav shared by every /agent/* page.
export const AGENT_LINKS: { href: string; labelKey: MessageKey }[] = [
  { href: '/agent', labelKey: 'agent.nav.dashboard' },
  { href: '/agent/tasks', labelKey: 'agent.nav.tasks' },
]
