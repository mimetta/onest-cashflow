import { createSupabaseServerClient } from './supabase-server'
import { User } from '@/types'

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !authUser) return null

  const [userRes, deptsRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', authUser.id).single(),
    supabase.from('user_departments').select('department_id').eq('user_id', authUser.id),
  ])

  if (userRes.error || !userRes.data) return null

  const departmentIds = (deptsRes.data ?? []).map((r: any) => r.department_id as string)

  return {
    ...(userRes.data as Omit<User, 'departmentIds' | 'email'>),
    email: authUser.email ?? '',
    departmentIds,
  }
}
