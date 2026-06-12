'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export async function submitCategoryBudgets(
  lineItemAmounts: { lineItemId: string; departmentId: string; amount: number }[],
  year: number,
  month: number
) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'dept_head' || user.departmentIds.length === 0) {
    throw new Error('Unauthorized')
  }

  const allowedDepts = new Set(user.departmentIds)
  const unauthorized = lineItemAmounts.some(r => !allowedDepts.has(r.departmentId))
  if (unauthorized) throw new Error('Unauthorized: department mismatch')

  const supabase = await createSupabaseServerClient()

  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`

  const rows = lineItemAmounts.map(({ lineItemId, amount }) => ({
    line_item_id:   lineItemId,
    submitted_by:   user.id,
    month:          monthDate,
    amount,
    status:         'submitted' as const,
    version:        1,
    visible_to_ceo: false,
    submitted_at:   new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('budget_submissions')
    .upsert(rows, { onConflict: 'line_item_id,month' })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/dept')
}
