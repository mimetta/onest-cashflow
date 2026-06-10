'use server'

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getCurrentUser } from '@/lib/auth'

export async function assignDepartment(userId: string, departmentId: string): Promise<void> {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== 'admin') throw new Error('Unauthorized')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('user_departments')
    .insert({ user_id: userId, department_id: departmentId })
  if (error) throw new Error(error.message)
}

export async function unassignDepartment(userId: string, departmentId: string): Promise<void> {
  const admin = await getCurrentUser()
  if (!admin || admin.role !== 'admin') throw new Error('Unauthorized')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('user_departments')
    .delete()
    .eq('user_id', userId)
    .eq('department_id', departmentId)
  if (error) throw new Error(error.message)
}
