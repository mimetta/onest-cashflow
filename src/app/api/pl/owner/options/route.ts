import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * GET /api/pl/owner/options
 * Returns two groups for the owner name datalist:
 *   1. People  — active user names from public.users
 *   2. Departments — from departments table, prefixed with "— … —"
 * If no active users exist, returns only department options.
 */
export async function GET() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = serviceClient()
  const [usersRes, deptsRes] = await Promise.all([
    db.from('users').select('name').eq('is_active', true).order('name'),
    db.from('departments').select('full_name').order('full_name'),
  ])

  const people = (usersRes.data ?? [])
    .map((u: any) => u.name as string)
    .filter(Boolean)

  const depts = (deptsRes.data ?? [])
    .map((d: any) => `— ${d.full_name} —`)

  return NextResponse.json({ people, depts })
}
