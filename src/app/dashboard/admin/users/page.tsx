import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import UserAssignments from './UserAssignments'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function AdminUsersPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  const db = serviceClient()

  const [authList, usersRes, deptsRes, assignmentsRes] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from('users').select('id, name, role, is_active').order('name'),
    db.from('departments').select('id, code, full_name').order('full_name'),
    db.from('user_departments').select('user_id, department_id'),
  ])

  // Build email map from auth users (email only available in auth.users)
  const authEmailMap = new Map<string, string>(
    (authList.data?.users ?? []).map(u => [u.id, u.email ?? '']),
  )

  const users = (usersRes.data ?? []).map(u => ({
    id:        u.id,
    name:      (u as any).name as string | null,
    role:      (u as any).role as string,
    is_active: (u as any).is_active as boolean,
    email:     authEmailMap.get(u.id) ?? '',
  }))

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.name ?? user.email} role={user.role} />
      <main className="flex-1">
        <UserAssignments
          users={users}
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
