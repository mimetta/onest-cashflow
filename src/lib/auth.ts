import { createSupabaseServerClient } from './supabase-server'
import { User } from '@/types'

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !authUser) return null

  const { data: userRecord, error: dbError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (dbError || !userRecord) return null

  return userRecord as User
}
