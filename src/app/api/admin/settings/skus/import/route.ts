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
  effective_month?: string   // 'YYYY-MM-DD'
}

/**
 * POST /api/admin/settings/skus/import
 * Upserts skus (sku_code, sku_name, volume_ml) and optionally upserts standard_costs (dm_per_ml).
 * sku_code is optional — auto-generated from name initials + volume if not provided.
 * Matching priority: sku_code first → sku_name fallback.
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

  // Build lookup maps for both name and code
  const { data: existing, error: fetchError } = await db.from('skus').select('id, sku_name, sku_code')
  if (fetchError) {
    console.error('SKU import: failed to fetch existing SKUs:', fetchError)
    return NextResponse.json({ error: `DB fetch failed: ${fetchError.message}` }, { status: 500 })
  }

  const nameMap = new Map<string, string>()  // sku_name.lower → id
  const codeMap = new Map<string, string>()  // sku_code.lower → id
  for (const s of existing ?? []) {
    nameMap.set(s.sku_name.toLowerCase(), s.id)
    if (s.sku_code) codeMap.set(s.sku_code.toLowerCase(), s.id)
  }

  let imported = 0; let updated = 0
  const errors: string[] = []

  for (const row of body.rows) {
    const name     = row.name?.trim()
    const rowCode  = row.sku_code?.trim()
    if (!name) continue

    // Find existing by code first, then by name
    let skuId = (rowCode ? codeMap.get(rowCode.toLowerCase()) : undefined)
             ?? nameMap.get(name.toLowerCase())

    if (skuId) {
      // Update existing row
      const updatePayload: Record<string, unknown> = { volume_ml: row.volume_ml }
      if (rowCode) updatePayload.sku_code = rowCode
      const { error } = await db.from('skus').update(updatePayload).eq('id', skuId)
      if (error) {
        console.error('SKU import: update failed:', { name, rowCode, volume_ml: row.volume_ml }, 'Error:', { code: error.code, message: error.message, details: error.details, hint: error.hint })
        errors.push(`Update "${name}": [${error.code}] ${error.message}`)
        continue
      }
      if (rowCode) codeMap.set(rowCode.toLowerCase(), skuId)
      updated++
    } else {
      // Insert new — use provided sku_code or auto-generate
      const baseCode = rowCode || autoSkuCode(name, row.volume_ml)
      let code = baseCode; let attempt = 0
      let inserted = false
      while (true) {
        const insertData = { sku_code: code, sku_name: name, uom: 'ml', volume_ml: row.volume_ml }
        const { data, error } = await db
          .from('skus')
          .insert(insertData)
          .select('id')
          .single()
        if (!error && data) {
          skuId = data.id
          nameMap.set(name.toLowerCase(), data.id)
          codeMap.set(code.toLowerCase(), data.id)
          imported++
          inserted = true
          break
        }
        console.error('SKU import: insert failed:', insertData, 'Error:', { code: error?.code, message: error?.message, details: (error as any)?.details, hint: (error as any)?.hint })
        // Only retry on sku_code unique violation — any other error fails the row
        if (error?.code === '23505' && (error.message.includes('sku_code') || error.message.includes('skus_sku_code'))) {
          attempt++; code = `${baseCode.slice(0, 47)}-${attempt}`
        } else {
          errors.push(`Insert "${name}": [${error?.code ?? '?'}] ${error?.message ?? 'unknown error'}`)
          break
        }
      }
      if (!inserted) continue
    }

    // Upsert standard_costs if dm_per_ml + effective_month provided
    if (skuId && row.dm_per_ml !== undefined && row.effective_month) {
      const scData = { sku_id: skuId, effective_month: row.effective_month, dm_per_ml: row.dm_per_ml, updated_at: new Date().toISOString() }
      const { error } = await db
        .from('standard_costs')
        .upsert(scData, { onConflict: 'sku_id,effective_month' })
      if (error) {
        console.error('SKU import: standard_costs upsert failed:', scData, 'Error:', { code: error.code, message: error.message })
        errors.push(`DM cost for "${name}": [${error.code}] ${error.message}`)
      }
    }
  }

  return NextResponse.json({
    imported,
    updated,
    errors,
    // Surface first 5 errors directly so the UI can display them
    errorSample: errors.slice(0, 5),
  })
}
