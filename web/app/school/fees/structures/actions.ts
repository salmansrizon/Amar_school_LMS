'use server'

import { revalidatePath } from 'next/cache'
import { requireSchoolMember } from '@/lib/auth/require-role'
import { createClient } from '@/lib/supabase/server'
import { buildFeeStructureCopy, type FeeStructureCore } from '@/lib/fees'

export type FeeStructureResult = { error?: string; savedId?: string }

function amount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '0').trim() || 0)
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN
}

function feeType(value: FormDataEntryValue | null): 'monthly' | 'one_time_yearly' | null {
  const v = String(value ?? '')
  return v === 'monthly' || v === 'one_time_yearly' ? v : null
}

export async function saveFeeStructure(formData: FormData): Promise<FeeStructureResult> {
  const classId = String(formData.get('class_id') ?? '')
  const academicYear = Number(formData.get('academic_year'))
  const type = feeType(formData.get('fee_type'))
  const editId = String(formData.get('edit_id') ?? '')
  const feeAmount = amount(formData.get('amount'))
  const fineRate = amount(formData.get('fine_per_absent_day'))

  if (!classId) return { error: 'Class is required' }
  if (!type) return { error: 'Fee type is required' }
  if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2100) {
    return { error: 'Academic year must be valid' }
  }
  if (Number.isNaN(feeAmount) || Number.isNaN(fineRate)) {
    return { error: 'Amounts must be non-negative numbers' }
  }

  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const payload = {
    class_id: classId,
    academic_year: academicYear,
    fee_type: type,
    amount: feeAmount,
    fine_per_absent_day: fineRate,
  }

  if (editId) {
    const { data, error } = await supabase
      .from('fee_structures')
      .update(payload)
      .eq('id', editId)
      .select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'Record not found or not accessible' }
    revalidatePath('/school/fees/structures')
    return { savedId: editId }
  }

  const { data, error } = await supabase.from('fee_structures').insert(payload).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/school/fees/structures')
  return { savedId: data.id }
}

// Copy-between-class/year (PRD §5.6): carries fee_type/amount/fine rate onto a
// target Class/Year via buildFeeStructureCopy (lib/fees.ts); upserts so a
// re-copy just refreshes the target instead of erroring on the unique
// constraint (one_structure_per_class_year_type, 0037).
export async function copyFeeStructure(
  sourceId: string,
  targetClassId: string,
  targetYear: number,
): Promise<FeeStructureResult> {
  const supabase = await createClient()
  if (!(await requireSchoolMember(supabase))) return { error: 'Unauthorized' }

  const { data: source, error: fetchError } = await supabase
    .from('fee_structures')
    .select('fee_type, amount, fine_per_absent_day')
    .eq('id', sourceId)
    .single()
  if (fetchError || !source) return { error: fetchError?.message ?? 'Source structure not found' }

  let payload
  try {
    payload = buildFeeStructureCopy(source as FeeStructureCore, targetClassId, targetYear)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid copy target' }
  }

  const { data, error } = await supabase
    .from('fee_structures')
    .upsert(payload, { onConflict: 'class_id,academic_year,fee_type' })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/school/fees/structures')
  return { savedId: data.id }
}
