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

  const { line_item_id, department_id, year, month, field, value } = body
  if (!line_item_id || !year || !month || !field || value == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!['budget', 'actual'].includes(field)) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  // Authenticate + authorise via session cookie
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await authClient.from('users').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'ceo'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`

  let db: ReturnType<typeof serviceClient>
  try { db = serviceClient() }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

  if (field === 'budget') {
    const { error } = await db.from('budget_submissions').upsert({
      line_item_id,
      submitted_by:   user.id,
      month:          monthDate,
      amount:         value,
      status:         'approved',
      version:        1,
      visible_to_ceo: true,
      note:           `Inline edit by ${profile.role} — ${now}`,
      submitted_at:   now,
    }, { onConflict: 'line_item_id,month' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data: existing } = await db
      .from('expenses')
      .select('id')
      .eq('line_item_id', line_item_id)
      .eq('month', monthDate)
      .eq('source', 'manual_admin_edit')
      .maybeSingle()

    if (existing) {
      const { error } = await db.from('expenses')
        .update({ amount: value, description: `Inline edit by ${profile.role} — ${now}` })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await db.from('expenses').insert({
        line_item_id,
        submitted_by: user.id,
        month:        monthDate,
        amount:       value,
        source:       'manual_admin_edit',
        status:       'approved',
        description:  `Inline edit by ${profile.role} — ${now}`,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
