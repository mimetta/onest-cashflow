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
    const db  = serviceClient()
    const { data, error } = await db
      .from('fg_production')
      .select('month, total_volume_ml')
      .order('month', { ascending: false })
    if (error) return NextResponse.json([], { status: 200 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { month: string; total_volume_ml: number }
  if (!body.month || typeof body.total_volume_ml !== 'number') {
    return NextResponse.json({ error: 'month and total_volume_ml required' }, { status: 400 })
  }

  const db  = serviceClient()
  const { data, error } = await db
    .from('fg_production')
    .upsert(
      { month: body.month, total_volume_ml: body.total_volume_ml, updated_at: new Date().toISOString() },
      { onConflict: 'month' },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { month } = await req.json() as { month: string }
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

  const db = serviceClient()
  const { error } = await db.from('fg_production').delete().eq('month', month)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
