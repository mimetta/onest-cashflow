import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PL_SECTIONS } from '@/lib/pl-structure'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * GET /api/admin/settings/cogs/line-items
 * Returns active line items in the cost_of_goods section for the "Apply to P&L" selector.
 */
export async function GET() {
  try {
    const cogsSection = PL_SECTIONS.find(s => s.id === 'cost_of_goods')
    if (!cogsSection) return NextResponse.json([])

    const deptCodes = new Set(cogsSection.groups.map(g => g.deptCode))

    const db = serviceClient()
    const { data, error } = await db
      .from('line_items')
      .select('id, name, categories(name, departments(code, full_name))')
      .eq('is_active', true)
      .order('name')

    if (error) return NextResponse.json([])

    const cogsItems = (data ?? []).filter(li => {
      const code = (li.categories as any)?.departments?.code
      return code && deptCodes.has(code)
    })

    return NextResponse.json(cogsItems.map(li => ({
      id:       li.id,
      name:     li.name,
      category: (li.categories as any)?.name ?? '',
      dept:     (li.categories as any)?.departments?.full_name ?? '',
    })))
  } catch {
    return NextResponse.json([])
  }
}
