import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { email, role, departmentIds } = body as {
    email:         string
    role:          string
    departmentIds: string[]
  }

  if (!email || !email.includes('@'))
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  if (!['admin', 'ceo', 'hr', 'dept_head'].includes(role))
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  // Auth check
  const authClient = await createSupabaseServerClient()
  const { data: { user: caller } } = await authClient.auth.getUser()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await authClient
    .from('users').select('role').eq('id', caller.id).single()
  if (!callerProfile || callerProfile.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let db: ReturnType<typeof serviceClient>
  try { db = serviceClient() }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

  // Send invite email via Supabase Auth
  const { data: inviteData, error: inviteError } = await db.auth.admin.inviteUserByEmail(email)
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })

  const newUserId = inviteData.user.id

  // Create profile row (upsert in case the auth trigger already created it)
  const { error: profileError } = await db.from('users').upsert({
    id:   newUserId,
    email,
    role,
  }, { onConflict: 'id' })
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  // Assign departments if provided
  if (Array.isArray(departmentIds) && departmentIds.length > 0) {
    const rows = departmentIds.map(departmentId => ({ user_id: newUserId, department_id: departmentId }))
    const { error: deptError } = await db
      .from('user_departments')
      .upsert(rows, { onConflict: 'user_id,department_id' })
    if (deptError) return NextResponse.json({ error: deptError.message }, { status: 500 })
  }

  return NextResponse.json({ userId: newUserId, email })
}
