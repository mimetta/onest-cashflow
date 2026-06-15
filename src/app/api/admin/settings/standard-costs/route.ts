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

export async function GET() {
  try {
    const db = serviceClient()
    const { data, error } = await db
      .from('standard_costs')
      .select('id, sku_id, effective_month, dm_per_ml, dl_per_ml, moh_per_ml, updated_at, skus(sku_name, sku_code)')
      .order('effective_month', { ascending: false })
    if (error) return NextResponse.json([], { status: 200 })
    const flat = (data ?? []).map((r: any) => ({
      id:              r.id,
      sku_id:          r.sku_id,
      sku_name:        r.skus?.sku_name ?? '',
      sku_code:        r.skus?.sku_code ?? '',
      effective_month: r.effective_month,
      dm_per_ml:       Number(r.dm_per_ml),
      dl_per_ml:       Number(r.dl_per_ml),
      moh_per_ml:      Number(r.moh_per_ml),
      updated_at:      r.updated_at,
    }))
    return NextResponse.json(flat)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = serviceClient()
  const { error } = await db.from('standard_costs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
