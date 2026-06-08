import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'

export default async function HrDashboard() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'hr') redirect('/login')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold text-gray-900">HR Dashboard</h1>
        <p className="mt-2 text-gray-500">Coming soon</p>
      </main>
    </div>
  )
}
