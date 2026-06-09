'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export async function approveSubmission(id: string) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ceo') throw new Error('Unauthorized')

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase
    .from('budget_submissions')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'submitted')

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/ceo')
}

export async function rejectSubmission(id: string, note: string) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ceo') throw new Error('Unauthorized')

  const supabase = await createSupabaseServerClient()

  const { error } = await supabase
    .from('budget_submissions')
    .update({
      status: 'rejected',
      note: note.trim() || null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'submitted')

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/ceo')
}
