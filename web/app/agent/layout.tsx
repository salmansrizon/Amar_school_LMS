import { currentLang } from '@/lib/i18n-server'
import { RoleGroupShell } from '@/components/role-group-shell'
import { getAgentContext } from '@/lib/agent/context'
import { AGENT_LINKS } from '@/lib/agent/nav'

// Persistent chrome for every /agent/* page (#271). getAgentContext re-verifies
// the agent role server-side (cache()-shared with the page).
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang()
  await getAgentContext()

  return (
    <RoleGroupShell lang={lang} links={AGENT_LINKS}>
      {children}
    </RoleGroupShell>
  )
}
