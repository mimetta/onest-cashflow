'use client'

import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import type { Role } from '@/types'

interface NavHeaderProps {
  userName: string
  role: Role
}

const ROLE_LABELS: Record<Role, string> = {
  admin:     'Admin',
  ceo:       'CEO',
  hr:        'HR',
  dept_head: 'Dept Head',
}

export default function NavHeader({ userName, role }: NavHeaderProps) {
  async function handleSignOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="bg-white border-b border-gray-200 shrink-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link
            href="/dashboard"
            className="text-base font-semibold text-gray-900 hover:text-gray-700 transition-colors"
          >
            Onest Cashflow
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900 leading-tight">{userName}</p>
              <p className="text-xs text-gray-400 leading-tight">{ROLE_LABELS[role] ?? role}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded px-3 py-1.5 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
