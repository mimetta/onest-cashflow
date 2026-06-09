'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export async function submitCategoryBudgets(
  lineItemAmounts: { lineItemId: string; amount: number }[],
  year: number,
  month: number
) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'dept_head' || !user.department_id) {
    throw new Error('Unauthorized')
  }

  const supabase = await createSupabaseServerClient()

  const rows = lineItemAmounts.map(({ lineItemId, amount }) => ({
    line_item_id: lineItemId,
    department_id: user.department_id!,
    user_id: user.id,
    year,
    month,
    amount,
    status: 'submitted' as const,
    submitted_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('budget_submissions')
    .upsert(rows, { onConflict: 'line_item_id,department_id,year,month' })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/dept')
}
