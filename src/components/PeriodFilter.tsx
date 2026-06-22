'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const VIEWS = [
  { id: '3month',    label: '3-Month' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yoy',       label: 'Year-over-Year' },
  { id: 'annual',    label: 'Annual' },
] as const

type ViewId = typeof VIEWS[number]['id']

function getPeriodOptions(mode: string): { value: string; label: string }[] {
  if (mode === 'quarterly' || mode === 'annual') {
    return [2025, 2026, 2027].map(y => ({ value: `${y}-01`, label: `${y}` }))
  }
  const opts: { value: string; label: string }[] = []
  for (let y = 2025; y <= 2027; y++)
    for (let m = 1; m <= 12; m++)
      opts.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${MN[m - 1]} ${y}` })
  return opts
}

function defaultAnchorFor(mode: string): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth() + 1
  if (mode === 'quarterly' || mode === 'annual') return `${y}-01`
  return `${y}-${String(m).padStart(2, '0')}`
}

export default function PeriodFilter({ mode, anchor }: { mode: string; anchor: string }) {
  const router = useRouter()
  const sp     = useSearchParams()

  function navigate(newMode: string, newAnchor?: string) {
    const params = new URLSearchParams(sp.toString())
    params.set('mode', newMode)
    if (newAnchor) params.set('anchor', newAnchor)
    else params.delete('anchor')
    router.push(`?${params.toString()}`)
  }

  const opts = getPeriodOptions(mode)

  return (
    <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-2 border border-gray-200">
      <span className="text-xs font-medium text-gray-500 shrink-0">View</span>
      <div className="flex gap-1">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => navigate(v.id, defaultAnchorFor(v.id))}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              mode === v.id
                ? 'bg-[#1e2a3a] text-white'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-gray-300 shrink-0" />

      <span className="text-xs font-medium text-gray-500 shrink-0">Period</span>
      <select
        value={anchor}
        onChange={e => navigate(mode, e.target.value)}
        className="text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-[#1e2a3a]/20 cursor-pointer"
      >
        {opts.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
