import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const deptCode = searchParams.get('dept')?.trim()
    const yearStr  = searchParams.get('year')?.trim()
    const apiKey   = searchParams.get('key')?.trim()

    // ── Authentication ────────────────────────────────────────────────────────
    const expectedKey = process.env.PUBLIC_API_KEY
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parameter validation ──────────────────────────────────────────────────
    if (!deptCode) {
      return NextResponse.json({ error: 'Missing required parameter: dept' }, { status: 400 })
    }
    if (!yearStr) {
      return NextResponse.json({ error: 'Missing required parameter: year' }, { status: 400 })
    }
    const year = parseInt(yearStr, 10)
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Invalid year — must be a 4-digit year' }, { status: 400 })
    }

    const db = serviceClient()

    // All 12 first-of-month dates for the requested year (DB format YYYY-MM-DD)
    const monthDates = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}-01`
    )
    // YYYY-MM keys for the response
    const monthKeys = monthDates.map(d => d.slice(0, 7))

    // ── Step 1: Find department by code (case-insensitive) ────────────────────
    const { data: dept, error: deptErr } = await db
      .from('departments')
      .select('id, code, full_name')
      .ilike('code', deptCode)
      .limit(1)
      .maybeSingle()
    if (deptErr) throw new Error(`Department lookup failed: ${deptErr.message}`)
    if (!dept) {
      return NextResponse.json({ error: `Department not found: "${deptCode}"` }, { status: 404 })
    }

    // ── Step 2: Get categories under this department ──────────────────────────
    const { data: cats, error: catsErr } = await db
      .from('categories')
      .select('id, name')
      .eq('department_id', dept.id)
    if (catsErr) throw new Error(`Categories lookup failed: ${catsErr.message}`)

    const catIds = (cats ?? []).map(c => c.id)

    // Empty department — return early with zeroed structure
    if (catIds.length === 0) {
      const emptyTotals = Object.fromEntries(monthKeys.map(mk => [mk, { budget: 0, actual: 0 }]))
      return NextResponse.json({
        status:       'ok',
        department:   dept.full_name,
        year,
        generated_at: new Date().toISOString(),
        line_items:   [],
        totals:       emptyTotals,
      })
    }

    // ── Step 3: Get line items for those categories ───────────────────────────
    const { data: lineItemsRaw, error: liErr } = await db
      .from('line_items')
      .select('id, name, category_id, categories(name)')
      .in('category_id', catIds)
      .order('name')
    if (liErr) throw new Error(`Line items lookup failed: ${liErr.message}`)

    const lineItems = lineItemsRaw ?? []
    const liIds     = lineItems.map(li => li.id)

    // ── Step 4: Fetch budget submissions + expenses in parallel ───────────────
    const [budgetRes, expenseRes] = await Promise.all([
      db.from('budget_submissions')
        .select('line_item_id, month, amount')
        .in('line_item_id', liIds)
        .in('month', monthDates)
        .eq('status', 'approved'),
      db.from('expenses')
        .select('line_item_id, month, amount')
        .in('line_item_id', liIds)
        .in('month', monthDates)
        .eq('status', 'approved'),
    ])
    if (budgetRes.error)  throw new Error(`Budget lookup failed: ${budgetRes.error.message}`)
    if (expenseRes.error) throw new Error(`Expenses lookup failed: ${expenseRes.error.message}`)

    // ── Build per-line-item, per-month maps ───────────────────────────────────
    // liId → monthKey → amount (sum, in case of multiple rows)
    const budgetMap: Record<string, Record<string, number>> = {}
    for (const r of budgetRes.data ?? []) {
      const mk = String(r.month).slice(0, 7)
      const li = budgetMap[r.line_item_id] ??= {}
      li[mk] = (li[mk] ?? 0) + Number(r.amount)
    }
    const actualMap: Record<string, Record<string, number>> = {}
    for (const r of expenseRes.data ?? []) {
      const mk = String(r.month).slice(0, 7)
      const li = actualMap[r.line_item_id] ??= {}
      li[mk] = (li[mk] ?? 0) + Number(r.amount)
    }

    // ── Assemble line_items array ─────────────────────────────────────────────
    const lineItemsOut = lineItems.map(li => {
      const catName = (li.categories as unknown as { name: string } | null)?.name ?? ''
      const months: Record<string, { budget: number; actual: number }> = {}
      for (const mk of monthKeys) {
        months[mk] = {
          budget: budgetMap[li.id]?.[mk] ?? 0,
          actual: actualMap[li.id]?.[mk] ?? 0,
        }
      }
      return { name: li.name, category: catName, months }
    })

    // ── Compute monthly totals ────────────────────────────────────────────────
    const totals: Record<string, { budget: number; actual: number }> = {}
    for (const mk of monthKeys) {
      totals[mk] = lineItemsOut.reduce(
        (acc, li) => ({ budget: acc.budget + li.months[mk].budget, actual: acc.actual + li.months[mk].actual }),
        { budget: 0, actual: 0 },
      )
    }

    return NextResponse.json({
      status:       'ok',
      department:   dept.full_name,
      year,
      generated_at: new Date().toISOString(),
      line_items:   lineItemsOut,
      totals,
    })

  } catch (e: any) {
    console.error('[public/department-budget]', e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? 'Unexpected server error' }, { status: 500 })
  }
}
