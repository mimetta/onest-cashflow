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

function toSkuCode(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50)
}

type ImportRow = {
  name:            string
  volume_ml:       number
  dm_per_ml?:      number
  effective_month?: string   // 'YYYY-MM-DD' — if present, write to standard_costs
}

/**
 * POST /api/admin/settings/skus/import
 * Upserts skus (name, volume_ml) and optionally upserts standard_costs (dm_per_ml).
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
  const { data: existing } = await db.from('skus').select('id, sku_name')
  const nameMap = new Map<string, string>()
  for (const s of existing ?? []) nameMap.set(s.sku_name.toLowerCase(), s.id)

  let imported = 0; let updated = 0
  const errors: string[] = []

  for (const row of body.rows) {
    const name = row.name?.trim()
    if (!name) continue

    let skuId = nameMap.get(name.toLowerCase())

    if (skuId) {
      // Update existing
      const { error } = await db.from('skus').update({ volume_ml: row.volume_ml }).eq('id', skuId)
      if (error) { errors.push(`${name}: ${error.message}`); continue }
      updated++
    } else {
      // Insert new with auto-generated code
      const baseCode = toSkuCode(name)
      let code = baseCode; let attempt = 0
      while (true) {
        const { data, error } = await db
          .from('skus')
          .insert({ sku_code: code, sku_name: name, uom: 'ml', volume_ml: row.volume_ml })
          .select('id')
          .single()
        if (!error && data) { skuId = data.id; nameMap.set(name.toLowerCase(), data.id); imported++; break }
        if (error?.code === '23505' && error.message.includes('sku_code')) {
          attempt++; code = `${baseCode.slice(0, 47)}-${attempt}`
        } else {
          errors.push(`${name}: ${error?.message ?? 'insert failed'}`); break
        }
      }
    }

    // If dm_per_ml and effective_month provided, upsert standard_costs
    if (skuId && row.dm_per_ml !== undefined && row.effective_month) {
      const { error } = await db
        .from('standard_costs')
        .upsert(
          { sku_id: skuId, effective_month: row.effective_month, dm_per_ml: row.dm_per_ml, updated_at: new Date().toISOString() },
          { onConflict: 'sku_id,effective_month' },
        )
      if (error) errors.push(`DM for ${name}: ${error.message}`)
    }
  }

  return NextResponse.json({ imported, updated, errors })
}
