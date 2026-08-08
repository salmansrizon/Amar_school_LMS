// Distributor lifecycle statuses (#299). Kept in a plain module — NOT the
// 'use server' actions file — so the client StatusControls can import the array
// itself. A 'use server' module may only export async functions, so re-exporting
// this const from there turns it into a server-action reference on the client
// (DISTRIBUTOR_STATUSES.filter is not a function).
export const DISTRIBUTOR_STATUSES = ['pending', 'under_review', 'approved', 'suspended', 'blocked'] as const

export type DistributorStatus = (typeof DISTRIBUTOR_STATUSES)[number]
