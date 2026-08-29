import { getRoleContext, type RoleContext } from '@/lib/auth/role-context'

// The /agent/* guard — the shared single-role gate pinned to 'agent'.
export type AgentContext = RoleContext
export const getAgentContext = (): Promise<AgentContext> => getRoleContext('agent')
