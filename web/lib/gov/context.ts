import { getRoleContext, type RoleContext } from '@/lib/auth/role-context'

// The /gov/* guard — the shared single-role gate pinned to 'gov_official'.
export type GovContext = RoleContext
export const getGovContext = (): Promise<GovContext> => getRoleContext('gov_official')
