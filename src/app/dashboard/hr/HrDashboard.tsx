'use client'

import { useState, Suspense } from 'react'
import type { PLData, Amounts } from '@/lib/pl-types'
import PLTable from '@/components/PLTable'
import PeriodSelector from '@/components/PeriodSelector'

function thb(n: number) {
  return `฿${Math.round(n).toLocaleString('en-US')}`
}

interface CategorySummary {
  categoryName: string
  budget: number
  actual: number
}

interface Props {
  mode: string
  period1: { label: string; data: PLData }
  period2: { label: string; data: PLData }
  deltaLabel: string
  categorySummary: CategorySummary[]
  totals: Amounts
}

export default function HrDashboard({ mode, period1, period2, deltaLabel, categorySummary, totals }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const pctUsed = totals.budget > 0
    ? ((totals.actual / totals.budget) * 100).toFixed(1)
    : null

  // Filter both periods' data based on selected category
  const filteredP1 = activeCategory
    ? {
        ...period1,
        data: {
          ...period1.data,
          sections: period1.data.sections.map(section => ({
            ...section,
            groups: section.groups.map(group => ({
              ...group,
              lineItems: group.lineItems.filter(li => li.categoryName === activeCategory),
            })).filter(g => g.lineItems.length > 0),
            total: (() => {
              const items = period1.data.sections
                .find(s => s.id === section.id)?.groups
                .flatMap(g => g.lineItems.filter(li => li.categoryName === activeCategory)) ?? []
              const b = items.reduce((s, i) => s + i.budget, 0)
              const a = items.reduce((s, i) => s + i.actual, 0)
              return { budget: b, actual: a, variance: b - a }
            })(),
          })).filter(s => s.groups.length > 0),
        },
      }
    : period1

  const filteredP2 = activeCategory
    ? {
        ...period2,
        data: {
          ...period2.data,
          sections: period2.data.sections.map(section => ({
            ...section,
            groups: section.groups.map(group => ({
              ...group,
              lineItems: group.lineItems.filter(li => li.categoryName === activeCategory),
            })).filter(g => g.lineItems.length > 0),
            total: (() => {
              const items = period2.data.sections
                .find(s => s.id === section.id)?.groups
                .flatMap(g => g.lineItems.filter(li => li.categoryName === activeCategory)) ?? []
              const b = items.reduce((s, i) => s + i.budget, 0)
              const a = items.reduce((s, i) => s + i.actual, 0)
              return { budget: b, actual: a, variance: b - a }
            })(),
          })).filter(s => s.groups.length > 0),
        },
      }
    : period2

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">HR — People Cost Dashboard</h1>
          <p className="text-sm text-gray-500">{period1.label}</p>
        </div>
        <Suspense>
          <PeriodSelector current={mode} />
        </Suspense>
      </div>

      {/* Category summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {categorySummary.map(cat => {
          const pct = cat.budget > 0 ? (cat.actual / cat.budget * 100) : 0
          const isActive = activeCategory === cat.categoryName
          return (
            <button
              key={cat.categoryName}
              onClick={() => setActiveCategory(isActive ? null : cat.categoryName)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                isActive
                  ? 'border-indigo-500 bg-indigo-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-indigo-200 shadow-sm'
              }`}
            >
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
                {cat.categoryName}
              </p>
              <p className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{thb(cat.actual)}</p>
              <p className="text-xs text-gray-400">of {thb(cat.budget)} budget</p>
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{pct.toFixed(1)}% used</p>
            </button>
          )
        })}
      </div>

      {/* Totals bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-6 items-center">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total HR Budget</p>
          <p className="text-lg font-bold tabular-nums">{thb(totals.budget)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Total Actual</p>
          <p className="text-lg font-bold tabular-nums">{thb(totals.actual)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">% Used</p>
          <p className={`text-lg font-bold tabular-nums ${pctUsed && Number(pctUsed) > 100 ? 'text-red-600' : 'text-emerald-700'}`}>
            {pctUsed ?? '—'}%
          </p>
        </div>
        {activeCategory && (
          <button
            onClick={() => setActiveCategory(null)}
            className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Clear filter ✕
          </button>
        )}
      </div>

      {/* Filtered P&L Table */}
      <PLTable
        period1={filteredP1}
        period2={filteredP2}
        deltaLabel={deltaLabel}
        showCalculatedRows={false}
      />
    </div>
  )
}
