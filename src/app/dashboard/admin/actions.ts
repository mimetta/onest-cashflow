'use server'

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export type HistoryRow = {
  id: string
  year: number
  month: number
  amount: number
  status: string
  departmentName: string
  submittedByName: string
  submittedAt: string | null
  approvedAt: string | null
  note: string | null
}

export async function adminUpdateBudget(params: {
  lineItemId: string
  departmentId: string
  year: number
  month: number
  amount: number
}): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Unauthorized')

  const supabase = await createSupabaseServerClient()
  const now       = new Date().toISOString()
  const monthDate = `${params.year}-${String(params.month).padStart(2, '0')}-01`

  const { error } = await supabase.from('budget_submissions').upsert({
    line_item_id:   params.lineItemId,
    submitted_by:   user.id,
    month:          monthDate,
    amount:         params.amount,
    status:         'approved',
    version:        1,
    visible_to_ceo: true,
    note:           `Edited by Admin — ${now}`,
    submitted_at:   now,
  }, { onConflict: 'line_item_id,month' })

  if (error) throw new Error(error.message)
}

export async function adminUpdateActual(params: {
  lineItemId: string
  monthDate: string   // 'YYYY-MM-01'
  amount: number
}): Promise<void> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Unauthorized')

  const supabase = await createSupabaseServerClient()
  const now = new Date().toISOString()

  const { data: existing } = await supabase
    .from('expenses')
    .select('id')
    .eq('line_item_id', params.lineItemId)
    .eq('month', params.monthDate)
    .eq('source', 'manual_admin_edit')
    .maybeSingle()

  if (existing) {
    await supabase
      .from('expenses')
      .update({ amount: params.amount, description: `Admin edit — ${now}` })
      .eq('id', existing.id)
  } else {
    await supabase.from('expenses').insert({
      line_item_id: params.lineItemId,
      submitted_by: user.id,
      month:        params.monthDate,
      amount:       params.amount,
      source:       'manual_admin_edit',
      status:       'approved',
      description:  `Admin edit — ${now}`,
    })
  }
}

export async function getLineItemHistory(lineItemId: string): Promise<HistoryRow[]> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('Unauthorized')

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('budget_submissions')
    .select(`
      id, month, amount, status, submitted_at, note,
      users ( name )
    `)
    .eq('line_item_id', lineItemId)
    .order('month', { ascending: false })
    .order('version', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((r: any) => {
    const d = r.month ? new Date(r.month) : null
    return {
      id:              r.id,
      year:            d ? d.getUTCFullYear() : 0,
      month:           d ? d.getUTCMonth() + 1 : 0,
      amount:          Number(r.amount),
      status:          r.status,
      departmentName:  '—',
      submittedByName: r.users?.name ?? '—',
      submittedAt:     r.submitted_at,
      approvedAt:      null,
      note:            r.note,
    }
  })
}
