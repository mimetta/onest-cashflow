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

// Raw CSV row as sent by the client
interface ImportRow {
  name:     string
  dept:     string
  category: string
  month:    number
  year:     number
  amount:   number
}

interface Resolved {
  lineItemId: string
  deptId:     string
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function buildLookup(lineItems: any[]): {
  full:    Map<string, Resolved>
  byName:  Map<string, Resolved>
  dbNames: [string, Resolved][]
} {
  const full    = new Map<string, Resolved>()
  const byName  = new Map<string, Resolved>()
  const dbNames: [string, Resolved][] = []
  for (const li of lineItems) {
    const cat  = li.categories
    const dept = cat?.departments
    if (!dept) continue
    const resolved: Resolved = { lineItemId: li.id, deptId: dept.id }
    const namePart = norm(li.name)
    const catPart  = norm(cat.name)
    full.set(`${namePart}|${norm(dept.code)}|${catPart}`,      resolved)
    full.set(`${namePart}|${norm(dept.full_name)}|${catPart}`, resolved)
    if (!byName.has(namePart)) byName.set(namePart, resolved)
    dbNames.push([namePart, resolved])
  }
  return { full, byName, dbNames }
}

function partialMatch(csvName: string, dbNames: [string, Resolved][]): Resolved | undefined {
  const csv = norm(csvName)
  for (const [dbName, resolved] of dbNames) {
    if (dbName.startsWith(csv) || csv.startsWith(dbName)) return resolved
  }
  return undefined
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

  // Fetch all line items once for server-side name resolution
  const { data: lineItemsData, error: liError } = await db.from('line_items').select(`
    id, name,
    categories ( name, departments ( id, code, full_name ) )
  `)
  if (liError) {
    console.error('[import] line_items fetch failed:', liError)
    return NextResponse.json({ error: `line_items fetch: ${liError.message}` }, { status: 500 })
  }

  const { full: lookup, byName: lookupByName, dbNames: lookupDbNames } = buildLookup(lineItemsData ?? [])
  console.log(`[import] lookup built — ${lookup.size} keys from ${(lineItemsData ?? []).length} line items`)

  const now      = new Date().toISOString()
  let   imported = 0
  const errors:  { index: number; row: Partial<ImportRow>; error: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]

    if (!r.name || !r.dept || !r.year || !r.month || r.amount == null) {
      const msg = 'Missing required field'
      console.error(`[import] row ${i}: ${msg}`, r)
      errors.push({ index: i, row: r, error: msg }); continue
    }

    const key      = `${norm(r.name)}|${norm(r.dept)}|${norm(r.category)}`
    const resolved = lookup.get(key)
      ?? lookupByName.get(norm(r.name))
      ?? partialMatch(r.name, lookupDbNames)
    if (!resolved) {
      const msg = `No match for name="${r.name}" dept="${r.dept}" category="${r.category}"`
      console.error(`[import] row ${i}: ${msg}`)
      errors.push({ index: i, row: r, error: msg }); continue
    }

    const monthDate = `${r.year}-${String(r.month).padStart(2, '0')}-01`

    try {
      if (type === 'budget') {
        const payload = {
          line_item_id:   resolved.lineItemId,
          submitted_by:   user.id,
          month:          monthDate,
          amount:         r.amount,
          status:         'approved',
          version:        1,
          visible_to_ceo: true,
          note:           `CSV import by admin — ${now}`,
          submitted_at:   now,
        }
        const { error } = await db
          .from('budget_submissions')
          .upsert(payload, { onConflict: 'line_item_id,month' })
        if (error) {
          console.error(`[import] row ${i} budget_submissions upsert failed — full error:`, JSON.stringify(error), '| payload:', JSON.stringify(payload))
          throw new Error(error.message)
        }
        console.log(`[import] row ${i} budget ok: ${r.name} ${monthDate} ${r.amount}`)
      } else {
        const payload = {
          line_item_id:  resolved.lineItemId,
          submitted_by:  user.id,
          month:         monthDate,
          amount:        r.amount,
          source:        'csv_import',
          status:        'approved',
          description:   `CSV import by admin — ${now}`,
        }
        const { error } = await db.from('expenses').insert(payload)
        if (error) {
          console.error(`[import] row ${i} expenses insert failed — full error:`, JSON.stringify(error), '| payload:', JSON.stringify(payload))
          throw new Error(error.message)
        }
        console.log(`[import] row ${i} actual ok: ${r.name} ${monthDate} ${r.amount}`)
      }
      imported++
    } catch (e: any) {
      const msg = e.message ?? String(e)
      errors.push({ index: i, row: r, error: msg })
    }
  }

  console.log(`[import] done — imported: ${imported}, errors: ${errors.length}`)
  return NextResponse.json({ imported, skipped: 0, errors })
}
