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

interface ImportRow {
  line_item_id:  string
  department_id: string
  year:          number
  month:         number
  amount:        number
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { type, rows }: { type: string; rows: ImportRow[] } = body
  if (!['budget', 'actual'].includes(type))
    return NextResponse.json({ error: 'type must be "budget" or "actual"' }, { status: 400 })
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: 'rows must be a non-empty array' }, { status: 400 })

  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await authClient.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let db: ReturnType<typeof serviceClient>
  try { db = serviceClient() }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

  const now      = new Date().toISOString()
  const imported: number[] = []
  const skipped: number[] = []
  const errors:  { index: number; error: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.line_item_id || !r.year || !r.month || r.amount == null) {
      errors.push({ index: i, error: 'Missing required field' }); continue
    }
    try {
      if (type === 'budget') {
        const { error } = await db.from('budget_submissions').upsert({
          line_item_id:  r.line_item_id,
          department_id: r.department_id,
          year:          r.year,
          month:         r.month,
          amount:        r.amount,
          status:        'approved',
          note:          `CSV import by admin — ${now}`,
          submitted_at:  now,
          approved_at:   now,
        }, { onConflict: 'line_item_id,department_id,year,month' })
        if (error) throw error
      } else {
        const monthDate = `${r.year}-${String(r.month).padStart(2, '0')}-01`
        const { error } = await db.from('expenses').insert({
          line_item_id:  r.line_item_id,
          submitted_by:  user.id,
          month:         monthDate,
          amount:        r.amount,
          source:        'csv_import',
          status:        'approved',
          description:   `CSV import by admin — ${now}`,
        })
        if (error) throw error
      }
      imported.push(i)
    } catch (e: any) {
      errors.push({ index: i, error: e.message ?? String(e) })
    }
  }

  return NextResponse.json({
    imported: imported.length,
    skipped:  skipped.length,
    errors,
  })
}
