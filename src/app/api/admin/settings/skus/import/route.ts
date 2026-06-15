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

/** Auto-generate SKU code from name initials + volume: "Song Wat Body Wash" + 250 → "SWBW-250" */
function autoSkuCode(name: string, volume_ml: number): string {
  const initials = name.trim().split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase())
    .join('')
  return initials ? `${initials}-${Math.round(volume_ml)}` : `SKU-${Math.round(volume_ml)}`
}

type ImportRow = {
  sku_code?:        string
  name:             string
  volume_ml:        number
  dm_per_ml?:       number
  effective_month?: string   // 'YYYY-MM-DD' — if present, write to standard_costs
}

/**
 * POST /api/admin/settings/skus/import
 * Upserts skus (sku_code, name, volume_ml) and optionally upserts standard_costs (dm_per_ml).
 * sku_code is optional — auto-generated from name initials + volume if not provided.
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
  const { data: existing } = await db.from('skus').select('id, sku_name, sku_code')
  const nameMap = new Map<string, string>()
  const codeMap = new Map<string, string>()
  for (const s of existing ?? []) {
    nameMap.set(s.sku_name.toLowerCase(), s.id)
    if (s.sku_code) codeMap.set(s.sku_code.toLowerCase(), s.id)
  }

  let imported = 0; let updated = 0
  const errors: string[] = []

  for (const row of body.rows) {
    const name = row.name?.trim()
    if (!name) continue

    // Find existing by name (name is the reliable match key for updates)
    let skuId = nameMap.get(name.toLowerCase())

    if (skuId) {
      // Update existing: always refresh volume_ml, update sku_code if provided and different
      const updatePayload: Record<string, unknown> = { volume_ml: row.volume_ml }
      if (row.sku_code?.trim()) updatePayload.sku_code = row.sku_code.trim()
      const { error } = await db.from('skus').update(updatePayload).eq('id', skuId)
      if (error) { errors.push(`${name}: ${error.message}`); continue }
      if (row.sku_code?.trim()) codeMap.set(row.sku_code.trim().toLowerCase(), skuId)
      updated++
    } else {
      // Insert new — use provided sku_code or auto-generate
      const baseCode = row.sku_code?.trim() || autoSkuCode(name, row.volume_ml)
      let code = baseCode; let attempt = 0
      while (true) {
        const { data, error } = await db
          .from('skus')
          .insert({ sku_code: code, sku_name: name, uom: 'ml', volume_ml: row.volume_ml })
          .select('id')
          .single()
        if (!error && data) {
          skuId = data.id
          nameMap.set(name.toLowerCase(), data.id)
          codeMap.set(code.toLowerCase(), data.id)
          imported++
          break
        }
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
