import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import NavHeader from '@/components/NavHeader'
import Link from 'next/link'
import LineItemsClient from './LineItemsClient'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export default async function LineItemsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  const db = serviceClient()
  const [itemsRes, deptsRes, catsRes] = await Promise.all([
    db.from('line_items').select(`
      id, name, type, is_active,
      categories ( id, name, is_hr_category, departments ( id, code, full_name ) )
    `).order('name'),
    db.from('departments').select('id, code, full_name').order('full_name'),
    db.from('categories').select('id, name, is_hr_category, department_id').order('name'),
  ])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.name ?? user.email} role={user.role} />
      <div className="px-4 py-4 border-b border-gray-200 bg-white">
        <Link href="/dashboard/admin" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← P&amp;L
        </Link>
      </div>
      <main className="flex-1">
        <LineItemsClient
          initialItems={(itemsRes.data ?? []) as any}
          departments={deptsRes.data ?? []}
          categories={catsRes.data ?? []}
        />
      </main>
    </div>
  )
}
