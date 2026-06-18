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

  console.log('[invite] payload received:', { email, role, departmentIds })

  if (!email || !email.includes('@'))
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  if (!['admin', 'ceo', 'hr', 'dept_head'].includes(role))
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  if (role === 'dept_head' && (!Array.isArray(departmentIds) || departmentIds.length === 0))
    return NextResponse.json({ error: 'dept_head role requires at least one department' }, { status: 400 })

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

  // Step 1: Send invite email via Supabase Auth
  const { data: inviteData, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    data: { role, name: email },
  })
  if (inviteError) {
    console.error('[invite] inviteUserByEmail error:', inviteError)
    return NextResponse.json({ error: inviteError.message }, { status: 500 })
  }

  const newUserId = inviteData.user.id
  console.log('[invite] auth user created, id:', newUserId)

  // Step 2: Insert into public.users
  // IMPORTANT: The check constraint `dept_head_needs_department` on public.users
  // requires a user_departments row to exist BEFORE the role can be set to 'dept_head'.
  // But user_departments.user_id FK requires public.users to exist first — a circular
  // dependency. Workaround: insert public.users with a placeholder role that satisfies
  // the constraint ('admin'), then insert user_departments, then update to 'dept_head'.
  const initialRole = role === 'dept_head' ? 'admin' : role

  const { error: profileError } = await db.from('users').upsert({
    id:        newUserId,
    name:      email,
    role:      initialRole,
    is_active: true,
  }, { onConflict: 'id' })
  if (profileError) {
    console.error('[invite] users upsert error:', profileError)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }
  console.log('[invite] public.users inserted with role:', initialRole)

  // Step 3: Assign departments
  if (Array.isArray(departmentIds) && departmentIds.length > 0) {
    console.log('[invite] inserting user_departments:', departmentIds)
    const rows = departmentIds.map(department_id => ({ user_id: newUserId, department_id }))
    const { error: deptError } = await db
      .from('user_departments')
      .upsert(rows, { onConflict: 'user_id,department_id' })
    if (deptError) {
      console.error('[invite] user_departments upsert error:', deptError)
      return NextResponse.json({ error: deptError.message }, { status: 500 })
    }
    console.log('[invite] user_departments inserted:', rows.length, 'rows')
  }

  // Step 4: Now that user_departments rows exist, update role to dept_head
  // (the check constraint will pass because the FK rows are in place)
  if (role === 'dept_head') {
    const { error: roleError } = await db
      .from('users')
      .update({ role: 'dept_head' })
      .eq('id', newUserId)
    if (roleError) {
      console.error('[invite] role update to dept_head error:', roleError)
      return NextResponse.json({ error: roleError.message }, { status: 500 })
    }
    console.log('[invite] role updated to dept_head')
  }

  console.log('[invite] success for', email)
  return NextResponse.json({ success: true, message: `Invite sent to ${email}` })
}
