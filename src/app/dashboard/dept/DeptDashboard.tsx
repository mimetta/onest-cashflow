'use client'

import { Suspense } from 'react'
import type { PLData } from '@/lib/pl-types'
import PLTable from '@/components/PLTable'
import PeriodSelector from '@/components/PeriodSelector'

function thb(n: number) {
  return `฿${Math.round(n).toLocaleString('en-US')}`
}

interface KPI {
  totalBudget: number
  actualSpent: number
  variance: number
}

interface Props {
  deptName: string
  mode: string
  period1: { label: string; data: PLData }
  period2: { label: string; data: PLData }
  deltaLabel: string
  kpi: KPI
}

export default function DeptDashboard({ deptName, mode, period1, period2, deltaLabel, kpi }: Props) {
  const pctUsed = kpi.totalBudget > 0
    ? ((kpi.actualSpent / kpi.totalBudget) * 100).toFixed(1)
    : null

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{deptName}</h1>
          <p className="text-sm text-gray-500">{period1.label} P&amp;L View</p>
        </div>
        <Suspense>
          <PeriodSelector current={mode} />
        </Suspense>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Budget</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{thb(kpi.totalBudget)}</p>
          <p className="mt-0.5 text-xs text-gray-400">{period1.label}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Actual Spent</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{thb(kpi.actualSpent)}</p>
          <p className="mt-0.5 text-xs text-gray-400">{period1.label}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">% Used</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${
            pctUsed && Number(pctUsed) > 100 ? 'text-red-600' : 'text-gray-900'
          }`}>
            {pctUsed ? `${pctUsed}%` : '—'}
          </p>
          <div className="mt-2 h-2 rounded-full overflow-hidden bg-gray-100">
            {pctUsed && (
              <div
                className={`h-full rounded-full ${Number(pctUsed) > 100 ? 'bg-red-500' : Number(pctUsed) > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(Number(pctUsed), 100)}%` }}
              />
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Variance</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${
            kpi.variance >= 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {kpi.variance >= 0 ? '+' : ''}{thb(kpi.variance)}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">Budget − Actual</p>
        </div>
      </div>

      {/* Filtered P&L Table */}
      <PLTable
        period1={period1}
        period2={period2}
        deltaLabel={deltaLabel}
        showCalculatedRows={false}
      />
    </div>
  )
}
