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
  const now = new Date().toISOString()

  const { error } = await supabase.from('budget_submissions').upsert({
    line_item_id:  params.lineItemId,
    department_id: params.departmentId,
    year:          params.year,
    month:         params.month,
    amount:        params.amount,
    status:        'approved',
    note:          `Edited by Admin — ${now}`,
    submitted_by:  user.id,
    submitted_at:  now,
    approved_at:   now,
  }, { onConflict: 'line_item_id,department_id,year,month' })

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
      id, year, month, amount, status, submitted_at, approved_at, note,
      departments ( full_name ),
      users ( full_name, email )
    `)
    .eq('line_item_id', lineItemId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((r: any) => ({
    id: r.id,
    year: r.year,
    month: r.month,
    amount: Number(r.amount),
    status: r.status,
    departmentName: r.departments?.full_name ?? '—',
    submittedByName: r.users?.full_name ?? r.users?.email ?? '—',
    submittedAt: r.submitted_at,
    approvedAt: r.approved_at,
    note: r.note,
  }))
}
