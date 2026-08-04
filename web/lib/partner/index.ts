// Partner Management (map #258, #270). Thin helpers over the RLS-scoped partner
// tables + the distributor lifecycle RPC. Distributors own their CRM leads and
// tasks; super-admin oversees; onboarding runs through the Workflow engine.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createWorkflowEngine } from '@/lib/engines/workflow/engine'

export type DistributorStatus = 'pending' | 'under_review' | 'approved' | 'suspended' | 'blocked'
export type LeadStage = 'new' | 'contacted' | 'demo' | 'negotiation' | 'won' | 'lost'

/** Set a distributor's lifecycle status (super/system); emits DistributorApproved. */
export async function setDistributorStatus(
  client: SupabaseClient,
  distributorId: string,
  status: DistributorStatus,
  jobSecret?: string,
): Promise<void> {
  const { error } = await client.rpc('set_distributor_status', {
    p_distributor: distributorId,
    p_status: status,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`set_distributor_status failed: ${error.message}`)
}

/** Create a CRM lead (distributor owns it, via RLS). */
export async function createLead(
  client: SupabaseClient,
  input: { distributorId: string; schoolName: string; contactName?: string; contactPhone?: string; notes?: string },
): Promise<string> {
  const { data, error } = await client
    .from('leads')
    .insert({
      distributor_id: input.distributorId,
      school_name: input.schoolName,
      contact_name: input.contactName ?? null,
      contact_phone: input.contactPhone ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createLead failed: ${error.message}`)
  return data!.id
}

/** Advance a lead through the pipeline. */
export async function setLeadStage(client: SupabaseClient, leadId: string, stage: LeadStage): Promise<void> {
  const { error } = await client.from('leads').update({ stage, updated_at: new Date().toISOString() }).eq('id', leadId)
  if (error) throw new Error(`setLeadStage failed: ${error.message}`)
}

/** Assign an agent under a distributor (super-admin). */
export async function assignAgent(client: SupabaseClient, agentId: string, distributorId: string): Promise<void> {
  const { error } = await client
    .from('agent_assignments')
    .upsert({ agent_id: agentId, distributor_id: distributorId })
  if (error) throw new Error(`assignAgent failed: ${error.message}`)
}

/** Accept a distributor agreement version, recording legal metadata (IP/device)
 * and flipping the profile's agreement status. */
export async function acceptAgreement(
  client: SupabaseClient,
  input: { version: number; ip?: string; device?: string; distributorId?: string },
  jobSecret?: string,
): Promise<string> {
  const { data, error } = await client.rpc('accept_agreement', {
    p_version: input.version,
    p_ip: input.ip ?? null,
    p_device: input.device ?? null,
    p_distributor: input.distributorId ?? null,
    job_secret: jobSecret ?? null,
  })
  if (error) throw new Error(`accept_agreement failed: ${error.message}`)
  return data as string
}

/** Start a distributor's onboarding workflow (Workflow engine). */
export async function startDistributorOnboarding(
  client: SupabaseClient,
  distributorId: string,
): Promise<string> {
  const { instanceId } = await createWorkflowEngine(client).start({
    definitionKey: 'distributor_onboarding',
    schoolId: null,
    initiatorId: '',
    entityType: 'distributor',
    entityId: distributorId,
  })
  return instanceId
}
