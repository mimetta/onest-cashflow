import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import type { CogsResult } from '@/lib/cogs-calculator'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * GET /api/admin/settings/cogs?month=YYYY-MM-DD
 * DL/ml  = DL actuals (cogm_group=DL)  ÷ total FG volume
 * MOH/ml = MOH actuals (cogm_group=MOH) ÷ total FG volume
 * Per-SKU COGS = units_sold × volume_ml × (dm + dl + moh per ml)
 * Note: skus DB column is `name`, exposed as `sku_name` in response.
 */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

  try {
    const db = serviceClient()

    const [fgRes, liRes, skuRes, scRes, suRes] = await Promise.all([
      db.from('fg_production').select('total_volume_ml').eq('month', month).maybeSingle(),
      db.from('line_items').select('id, categories(cogm_group)'),
      // DB column is `name`, not `sku_name`
      db.from('skus').select('id, name, sku_code, volume_ml').eq('is_active', true),
      db.from('standard_costs')
        .select('sku_id, effective_month, dm_per_ml')
        .lte('effective_month', month)
        .order('effective_month', { ascending: false }),
      db.from('sales_units').select('sku_id, units_sold').eq('month', month),
    ])

    const totalVolumeMl = fgRes.data?.total_volume_ml ? Number(fgRes.data.total_volume_ml) : 0

    const dlIds  = new Set<string>()
    const mohIds = new Set<string>()
    for (const li of liRes.data ?? []) {
      const g = (li.categories as any)?.cogm_group
      if (g === 'DL')  dlIds.add(li.id)
      if (g === 'MOH') mohIds.add(li.id)
    }
    const cogmIds = [...dlIds, ...mohIds]

    let dlActual = 0, mohActual = 0
    if (cogmIds.length > 0) {
      const { data: expenses } = await db
        .from('expenses')
        .select('line_item_id, amount')
        .eq('month', month)
        .eq('status', 'approved')
        .in('line_item_id', cogmIds)
      for (const e of expenses ?? []) {
        if (dlIds.has(e.line_item_id))       dlActual  += Number(e.amount)
        else if (mohIds.has(e.line_item_id)) mohActual += Number(e.amount)
      }
    }

    const dlPerMl  = totalVolumeMl > 0 ? dlActual  / totalVolumeMl : 0
    const mohPerMl = totalVolumeMl > 0 ? mohActual / totalVolumeMl : 0

    const dmMap = new Map<string, number>()
    for (const c of scRes.data ?? []) {
      if (!dmMap.has(c.sku_id)) dmMap.set(c.sku_id, Number(c.dm_per_ml))
    }

    const unitsMap = new Map<string, number>()
    for (const s of suRes.data ?? []) unitsMap.set(s.sku_id, Number(s.units_sold))

    const skuRows = (skuRes.data ?? []).map(sku => {
      const dmPerMl    = dmMap.get(sku.id) ?? 0
      const volMl      = Number(sku.volume_ml) || 0
      const units      = unitsMap.get(sku.id) ?? 0
      const totalPerMl = dmPerMl + dlPerMl + mohPerMl
      return {
        sku_id:       sku.id,
        sku_name:     sku.name,      // DB column `name` → API field `sku_name`
        sku_code:     sku.sku_code,
        volume_ml:    volMl,
        dm_per_ml:    dmPerMl,
        dl_per_ml:    dlPerMl,
        moh_per_ml:   mohPerMl,
        total_per_ml: totalPerMl,
        units_sold:   units,
        cogs:         units * volMl * totalPerMl,
      }
    })

    const result: CogsResult = {
      month,
      total_volume_ml: totalVolumeMl,
      dl_actual:   dlActual,
      moh_actual:  mohActual,
      dl_per_ml:   dlPerMl,
      moh_per_ml:  mohPerMl,
      skus:        skuRows,
      total_cogs:  skuRows.reduce((s, r) => s + r.cogs, 0),
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/admin/settings/cogs
 * Apply calculated COGS as a budget submission to a chosen line item.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { month, line_item_id, total_cogs } = await req.json() as {
    month: string; line_item_id: string; total_cogs: number
  }
  if (!month || !line_item_id || total_cogs === undefined) {
    return NextResponse.json({ error: 'month, line_item_id, total_cogs required' }, { status: 400 })
  }

  const db = serviceClient()

  const { data: latest } = await db
    .from('budget_submissions')
    .select('version')
    .eq('line_item_id', line_item_id)
    .eq('month', month)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version ?? 0) + 1

  const { data, error } = await db
    .from('budget_submissions')
    .insert({
      line_item_id,
      month,
      amount:       Math.round(total_cogs),
      status:       'approved',
      version:      nextVersion,
      submitted_by: user.id,
      note:         'Auto-calculated COGS (standard costs × units sold)',
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, total_cogs, submission: data })
}
