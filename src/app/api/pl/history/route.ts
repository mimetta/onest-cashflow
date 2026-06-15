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

async function authenticate() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { user: null, profile: null }
  const { data: profile } = await authClient.from('users').select('role').eq('id', user.id).single()
  return { user, profile }
}

export async function GET(req: NextRequest) {
  const lineItemId = req.nextUrl.searchParams.get('line_item_id')
  if (!lineItemId) return NextResponse.json({ error: 'Missing line_item_id' }, { status: 400 })

  const { user, profile } = await authenticate()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile || !['admin', 'ceo'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use service client so RLS never silently filters rows
  let db: ReturnType<typeof serviceClient>
  try { db = serviceClient() }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

  // All budget_submissions for this line item — no month filter
  const histRes = await db
    .from('budget_submissions')
    .select('id, amount, month, status, version, submitted_at, note, submitted_by')
    .eq('line_item_id', lineItemId)
    .order('month', { ascending: false })
    .order('version', { ascending: false })

  console.log('[pl/history GET] line_item_id:', lineItemId)
  console.log('[pl/history GET] histRes.error:', histRes.error)
  console.log('[pl/history GET] histRes.data count:', histRes.data?.length ?? 0)
  console.log('[pl/history GET] histRes.data:', JSON.stringify(histRes.data?.slice(0, 3)))

  // Resolve submitter names from users.name
  const userNameMap = new Map<string, string>()
  const submitterIds = [...new Set((histRes.data ?? []).map((r: any) => r.submitted_by).filter(Boolean))]
  if (submitterIds.length > 0) {
    const usersRes = await db.from('users').select('id, name').in('id', submitterIds)
    console.log('[pl/history GET] users lookup error:', usersRes.error)
    for (const u of (usersRes.data ?? [])) {
      userNameMap.set((u as any).id, (u as any).name ?? '—')
    }
  }

  // Line item metadata
  const liRes = await db
    .from('line_items')
    .select('name, categories ( name, departments ( full_name ) )')
    .eq('id', lineItemId)
    .single()

  // Actual expenses for this line item, all months
  const actualRes = await db
    .from('expenses')
    .select('amount, month')
    .eq('line_item_id', lineItemId)
    .eq('status', 'approved')

  // Build actual map: monthKey → total
  const actualMap = new Map<string, number>()
  for (const r of (actualRes.data ?? [])) {
    const key = String(r.month).slice(0, 10)
    actualMap.set(key, (actualMap.get(key) ?? 0) + Number(r.amount))
  }

  // Group budget history by month
  const byMonth = new Map<string, Array<{
    id: string; amount: number; status: string; version: number
    submitted_at: string | null; note: string | null; submitted_by_name: string
  }>>()
  for (const row of (histRes.data ?? [])) {
    const key = String((row as any).month).slice(0, 10)
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push({
      id:                (row as any).id,
      amount:            Number((row as any).amount),
      status:            (row as any).status,
      version:           (row as any).version ?? 1,
      submitted_at:      (row as any).submitted_at ?? null,
      note:              (row as any).note ?? null,
      submitted_by_name: userNameMap.get((row as any).submitted_by) ?? '—',
    })
  }

  const months = [...byMonth.entries()].map(([month, entries]) => {
    const approved = entries.filter(e => e.status === 'approved')
    const budget   = approved.length > 0 ? approved[0].amount : 0
    const actual   = actualMap.get(month) ?? 0
    return { month, budget, actual, variance: budget - actual, entries }
  })

  const li = liRes.data as any
  return NextResponse.json({
    lineItem: {
      name:         li?.name ?? '',
      categoryName: li?.categories?.name ?? '',
      deptName:     li?.categories?.departments?.full_name ?? '',
    },
    months,
  })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.id || !body?.status) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
  }
  if (!['approved', 'rejected'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { user, profile } = await authenticate()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!profile || !['admin', 'ceo'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let db: ReturnType<typeof serviceClient>
  try { db = serviceClient() }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

  const { error } = await db
    .from('budget_submissions')
    .update({ status: body.status })
    .eq('id', body.id)

  if (error) {
    console.error('[pl/history PATCH] failed:', JSON.stringify(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
