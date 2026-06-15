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

/** GET /api/admin/settings/sales-units?month=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })
  try {
    const db = serviceClient()
    const { data, error } = await db
      .from('sales_units')
      .select('sku_id, units_sold, updated_at')
      .eq('month', month)
    if (error) return NextResponse.json([], { status: 200 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

/** PATCH /api/admin/settings/sales-units — upsert one SKU+month entry */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sku_id, month, units_sold } = await req.json() as {
    sku_id: string
    month: string
    units_sold: number
  }
  if (!sku_id || !month || units_sold === undefined) {
    return NextResponse.json({ error: 'sku_id, month, units_sold required' }, { status: 400 })
  }

  const db = serviceClient()
  const { data, error } = await db
    .from('sales_units')
    .upsert(
      { sku_id, month, units_sold, updated_at: new Date().toISOString() },
      { onConflict: 'sku_id,month' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
