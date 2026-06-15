import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import Link from 'next/link'
import SettingsTabBar from './SettingsTabBar'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.name ?? user.email} role={user.role} />
      <div className="px-4 py-4 border-b border-gray-200 bg-white flex items-center gap-4">
        <Link href="/dashboard/admin" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← P&amp;L
        </Link>
        <span className="text-gray-200">|</span>
        <SettingsTabBar />
      </div>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  )
}
