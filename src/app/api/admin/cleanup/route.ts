// One-time cleanup route — DELETE after use
// Hit with: curl -X POST https://<your-domain>/api/admin/cleanup
// Or open in browser (GET) when signed in as admin
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function GET() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = await createSupabaseServerClient()

  // Remove duplicate line_items — keep the row with the smallest id per (name, category_id)
  const { data: liData, error: liError } = await supabase.rpc('cleanup_duplicate_line_items')
  // Remove duplicate categories — keep the row with the smallest id per (name, department_id)
  const { data: catData, error: catError } = await supabase.rpc('cleanup_duplicate_categories')

  // Count remaining rows
  const [{ count: liCount }, { count: catCount }] = await Promise.all([
    supabase.from('line_items').select('*', { count: 'exact', head: true }),
    supabase.from('categories').select('*', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    message: 'Cleanup complete',
    line_items_remaining: liCount,
    categories_remaining: catCount,
    errors: { lineItems: liError?.message, categories: catError?.message },
  })
}
