import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import NavHeader from '@/components/NavHeader'
import UserAssignments from './UserAssignments'

export default async function AdminUsersPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  const supabase = await createSupabaseServerClient()

  const [usersRes, deptsRes, assignmentsRes] = await Promise.all([
    supabase.from('users').select('id, email, full_name, role').order('full_name'),
    supabase.from('departments').select('id, code, full_name').order('full_name'),
    supabase.from('user_departments').select('user_id, department_id'),
  ])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1">
        <UserAssignments
          users={usersRes.data ?? []}
          departments={deptsRes.data ?? []}
          initialAssignments={(assignmentsRes.data ?? []).map(r => ({
            userId:       r.user_id,
            departmentId: r.department_id,
          }))}
        />
      </main>
    </div>
  )
}
