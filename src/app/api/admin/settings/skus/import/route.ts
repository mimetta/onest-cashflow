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

type ImportRow = { name: string; volume_ml: number }

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

  // Load all existing SKUs for name matching (case-insensitive)
  const { data: existing } = await db.from('skus').select('id, sku_name, sku_code')
  const nameMap = new Map<string, { id: string; sku_code: string }>()
  for (const s of existing ?? []) nameMap.set(s.sku_name.toLowerCase(), { id: s.id, sku_code: s.sku_code })

  let imported = 0
  let updated  = 0
  const errors: string[] = []

  for (const row of body.rows) {
    const name = row.name?.trim()
    if (!name) continue

    const existing = nameMap.get(name.toLowerCase())
    if (existing) {
      // Update volume_ml on existing SKU
      const { error } = await db
        .from('skus')
        .update({ volume_ml: row.volume_ml })
        .eq('id', existing.id)
      if (error) errors.push(`${name}: ${error.message}`)
      else updated++
    } else {
      // Insert new SKU with auto-generated code
      const baseCode = toSkuCode(name)
      // Try the base code; append suffix if collision
      let code = baseCode
      let attempt = 0
      while (true) {
        const { error } = await db
          .from('skus')
          .insert({ sku_code: code, sku_name: name, uom: 'ml', volume_ml: row.volume_ml })
        if (!error) { imported++; break }
        if (error.code === '23505' && error.message.includes('sku_code')) {
          attempt++
          code = `${baseCode.slice(0, 47)}-${attempt}`
        } else {
          errors.push(`${name}: ${error.message}`)
          break
        }
      }
    }
  }

  return NextResponse.json({ imported, updated, errors })
}
