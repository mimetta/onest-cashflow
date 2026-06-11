import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import NavHeader from '@/components/NavHeader'
import ImportClient from './ImportClient'

export default async function ImportPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('line_items').select(`
    id, name,
    categories ( name, departments ( id, code, full_name ) )
  `)

  const validKeys = (data ?? []).map((li: any) => ({
    lineItemId:   li.id as string,
    lineItemName: li.name as string,
    deptId:       li.categories?.departments?.id        as string,
    deptCode:     li.categories?.departments?.code      as string,
    deptFullName: li.categories?.departments?.full_name as string,
    categoryName: li.categories?.name                   as string,
  })).filter(k => k.deptId && k.deptCode)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1">
        <ImportClient validKeys={validKeys} />
      </main>
    </div>
  )
}
