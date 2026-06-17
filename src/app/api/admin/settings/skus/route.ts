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

function adminOnly(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// DB column is `name`; we expose it as `sku_name` in the API response for frontend compat
function mapRow(r: any) {
  return {
    id:         r.id,
    sku_code:   r.sku_code,
    sku_name:   r.name,
    uom:        r.uom,
    volume_ml:  r.volume_ml,
    is_active:  r.is_active,
    created_at: r.created_at,
  }
}

export async function GET() {
  try {
    const db = serviceClient()
    const { data, error } = await db
      .from('skus')
      .select('id, sku_code, name, uom, volume_ml, is_active, created_at')
      .order('sku_code')
    if (error) return NextResponse.json([], { status: 200 })
    return NextResponse.json((data ?? []).map(mapRow))
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  const denied = adminOnly(user)
  if (denied) return denied

  const body = await req.json() as { sku_code: string; sku_name: string; uom?: string }
  if (!body.sku_code?.trim() || !body.sku_name?.trim()) {
    return NextResponse.json({ error: 'sku_code and sku_name required' }, { status: 400 })
  }

  const db = serviceClient()
  const { data, error } = await db
    .from('skus')
    .insert({ sku_code: body.sku_code.trim(), name: body.sku_name.trim(), uom: body.uom ?? 'ml' })
    .select('id, sku_code, name, uom, volume_ml, is_active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(mapRow(data))
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  const denied = adminOnly(user)
  if (denied) return denied

  const body = await req.json() as { id: string; sku_code?: string; sku_name?: string; uom?: string; volume_ml?: number; is_active?: boolean }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (body.sku_code  !== undefined) update.sku_code  = body.sku_code.trim()
  if (body.sku_name  !== undefined) update.name       = body.sku_name.trim()
  if (body.uom       !== undefined) update.uom        = body.uom
  if (body.volume_ml !== undefined) update.volume_ml  = body.volume_ml
  if (body.is_active !== undefined) update.is_active  = body.is_active

  const db = serviceClient()
  const { data, error } = await db
    .from('skus')
    .update(update)
    .eq('id', body.id)
    .select('id, sku_code, name, uom, volume_ml, is_active, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(mapRow(data))
}
