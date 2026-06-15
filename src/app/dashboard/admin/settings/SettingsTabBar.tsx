'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'SKU Master',      href: '/dashboard/admin/settings/skus' },
  { label: 'Standard Costs',  href: '/dashboard/admin/settings/standard-costs' },
  { label: 'FG Production',   href: '/dashboard/admin/settings/fg-production' },
]

export default function SettingsTabBar() {
  const path = usePathname()
  return (
    <nav className="flex gap-1">
      {TABS.map(tab => {
        const active = path.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              active
                ? 'bg-[#1e2a3a] text-white'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
