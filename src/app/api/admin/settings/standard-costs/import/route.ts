import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type ImportRow = {
  sku_name:        string
  effective_month: string   // 'YYYY-MM-DD'
  dm_per_ml:       number
}

/**
 * POST /api/admin/settings/standard-costs/import
 * Upserts DM/ml per SKU per effective month.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { rows: ImportRow[] }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'rows required' }, { status: 400 })
  }

  const db = serviceClient()
  const { data: skus } = await db.from('skus').select('id, sku_name')
  const skuMap = new Map<string, string>()
  for (const s of skus ?? []) skuMap.set(s.sku_name.toLowerCase(), s.id)

  let imported = 0; let skipped = 0
  const errors: string[] = []

  for (const row of body.rows) {
    const name  = row.sku_name?.trim()
    if (!name) continue
    const skuId = skuMap.get(name.toLowerCase())
    if (!skuId) {
      skipped++
      errors.push(`SKU not found: "${name}"`)
      continue
    }
    const { error } = await db
      .from('standard_costs')
      .upsert(
        {
          sku_id:          skuId,
          effective_month: row.effective_month,
          dm_per_ml:       row.dm_per_ml ?? 0,
          updated_at:      new Date().toISOString(),
        },
        { onConflict: 'sku_id,effective_month' },
      )
    if (error) { errors.push(`${name}: ${error.message}`); skipped++ }
    else imported++
  }

  return NextResponse.json({ imported, skipped, errors })
}
