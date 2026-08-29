import { getRoleContext, type RoleContext } from '@/lib/auth/role-context'

// The /distributor/* guard — the shared single-role gate pinned to 'distributor'.
export type DistributorContext = RoleContext
export const getDistributorContext = (): Promise<DistributorContext> => getRoleContext('distributor')
