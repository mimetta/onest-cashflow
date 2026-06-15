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

async function requireAdmin() {
  const auth = await createSupabaseServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const { data: profile } = await auth.from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// GET — list all line items with category + department
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = serviceClient()
  const { data, error } = await db
    .from('line_items')
    .select(`
      id, name, type, is_active,
      categories ( id, name, is_hr_category, departments ( id, code, full_name ) )
    `)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — create new line item (optionally create new category first)
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    name: string
    category_id?: string
    new_category_name?: string
    department_id?: string
    is_hr_category?: boolean
  }

  const { name, category_id, new_category_name, department_id, is_hr_category = false } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const db = serviceClient()
  let catId = category_id

  if (new_category_name && department_id) {
    const { data: newCat, error: catErr } = await db
      .from('categories')
      .insert({ name: new_category_name, department_id, is_hr_category })
      .select('id')
      .single()
    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 })
    catId = newCat.id
  }

  if (!catId) return NextResponse.json({ error: 'category_id or new_category_name + department_id required' }, { status: 400 })

  const { data, error } = await db
    .from('line_items')
    .insert({ name, category_id: catId, type: 'EXPENSE', is_active: true })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id })
}

// PATCH — update line item (rename, move category, toggle is_active)
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    id: string
    name?: string
    category_id?: string
    is_active?: boolean
  }
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = serviceClient()
  const { error } = await db.from('line_items').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — soft deactivate (set is_active = false)
export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = serviceClient()
  const { error } = await db.from('line_items').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
