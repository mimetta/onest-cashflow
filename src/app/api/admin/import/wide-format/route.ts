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

interface WFImportRow {
  line_item_name:   string
  owner_from_sheet: string
  department:       string
  category:         string
  month:            number   // 1-12
  year:             number
  budget_amount:    number
  actual_amount:    number
}

interface Resolved { lineItemId: string; deptId: string }

function norm(s: string) { return s.trim().toLowerCase() }

function buildLookups(lineItems: any[]): {
  full: Map<string, Resolved>
  byName: Map<string, Resolved>
} {
  const full   = new Map<string, Resolved>()
  const byName = new Map<string, Resolved>()  // first match per name

  for (const li of lineItems) {
    const cat  = li.categories
    const dept = cat?.departments
    if (!dept) continue
    const resolved: Resolved = { lineItemId: li.id, deptId: dept.id }
    const namePart = norm(li.name)
    const catPart  = norm(cat.name)
    full.set(`${namePart}|${norm(dept.code)}|${catPart}`,      resolved)
    full.set(`${namePart}|${norm(dept.full_name)}|${catPart}`, resolved)
    // name-only fallback (keeps first match)
    if (!byName.has(namePart)) byName.set(namePart, resolved)
  }
  return { full, byName }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { rows, import_budget, import_actual, update_owners } = body as {
    rows:           WFImportRow[]
    import_budget:  boolean
    import_actual:  boolean
    update_owners:  boolean
  }

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

  const { data: lineItemsData, error: liError } = await db.from('line_items').select(`
    id, name,
    categories ( name, departments ( id, code, full_name ) )
  `)
  if (liError) return NextResponse.json({ error: `line_items fetch: ${liError.message}` }, { status: 500 })

  const { full, byName } = buildLookups(lineItemsData ?? [])

  const now           = new Date().toISOString()
  let budget_imported = 0
  let actual_imported = 0
  let owners_updated  = 0
  let skipped         = 0
  const errors: { row: number; error: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.line_item_name || !r.month || !r.year) { skipped++; continue }

    const fullKey  = `${norm(r.line_item_name)}|${norm(r.department)}|${norm(r.category)}`
    const resolved = full.get(fullKey) ?? byName.get(norm(r.line_item_name))
    if (!resolved) {
      errors.push({ row: i + 1, error: `No match for "${r.line_item_name}"` })
      skipped++
      continue
    }

    const monthDate = `${r.year}-${String(r.month).padStart(2, '0')}-01`

    if (import_budget && r.budget_amount > 0) {
      const { error } = await db.from('budget_submissions').upsert({
        line_item_id:   resolved.lineItemId,
        submitted_by:   user.id,
        month:          monthDate,
        amount:         Math.round(r.budget_amount),
        status:         'approved',
        version:        1,
        visible_to_ceo: true,
        note:           `Wide-format CSV import — ${now}`,
        submitted_at:   now,
      }, { onConflict: 'line_item_id,month' })
      if (error) {
        errors.push({ row: i + 1, error: `Budget upsert: ${error.message}` })
      } else {
        budget_imported++
      }
    }

    if (import_actual && r.actual_amount > 0) {
      const { error } = await db.from('expenses').insert({
        line_item_id: resolved.lineItemId,
        submitted_by: user.id,
        month:        monthDate,
        amount:       Math.round(r.actual_amount),
        source:       'csv_import',
        status:       'approved',
        description:  `Wide-format CSV import — ${now}`,
      })
      if (error) {
        errors.push({ row: i + 1, error: `Actual insert: ${error.message}` })
      } else {
        actual_imported++
      }
    }

    if (update_owners && r.owner_from_sheet.trim()) {
      // Only update if the line item currently has no owner set
      const { data: liRow } = await db
        .from('line_items').select('owner_name').eq('id', resolved.lineItemId).single()
      if (!liRow?.owner_name) {
        await db.from('line_items')
          .update({ owner_name: r.owner_from_sheet.trim() })
          .eq('id', resolved.lineItemId)
        owners_updated++
      }
    }
  }

  return NextResponse.json({ budget_imported, actual_imported, owners_updated, skipped, errors })
}
