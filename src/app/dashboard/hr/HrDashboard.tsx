'use client'

import { Suspense, useState, useMemo } from 'react'
import type { PLData, PLSectionData, PLGroupData, PLLineItemRow, Amounts } from '@/lib/pl-types'
import { addAmounts, ZERO } from '@/lib/pl-types'
import PLTable from '@/components/PLTable'
import PeriodSelector from '@/components/PeriodSelector'

function thb(n: number) { return `฿${Math.round(n).toLocaleString('en-US')}` }

const HR_CATS = ['HR Benefits', 'HR Operations', 'HR Salary'] as const
type HrCat = typeof HR_CATS[number] | 'All'

interface HrKpi { budget: number; actual: number }

interface Props {
  mode:             string
  period1:          { label: string; data: PLData }
  period2:          { label: string; data: PLData }
  deltaLabel:       string
  hrKpis:           Record<string, HrKpi>
  period1Full:      { label: string; data: PLData }
  period2Full:      { label: string; data: PLData }
}

// Client-side filter: keep only line items matching category + dept
function filterPLData(
  data: PLData,
  categoryFilter: HrCat,
  deptFilter: string,
): PLData {
  const sections = data.sections.map((section: PLSectionData) => {
    const groups = section.groups.map((group: PLGroupData) => {
      let lineItems = group.lineItems
      if (categoryFilter !== 'All') {
        lineItems = lineItems.filter((li: PLLineItemRow) => li.categoryName === categoryFilter)
      }
      if (deptFilter !== 'all') {
        lineItems = lineItems.filter(() => group.deptFullName === deptFilter)
      }
      const subtotal = lineItems.reduce(addAmounts, ZERO)
      return { ...group, lineItems, subtotal }
    }).filter((g: PLGroupData) => g.lineItems.length > 0)

    const total = groups.reduce((acc: Amounts, g: PLGroupData) => addAmounts(acc, g.subtotal), ZERO)
    return { ...section, groups, total }
  }).filter((s: PLSectionData) => s.groups.length > 0)

  // Rebuild calculatedRows from filtered section totals
  const totalsLookup: Record<string, Amounts> = {}
  for (const s of sections) totalsLookup[s.totalId] = s.total
  const calculatedRows = data.calculatedRows.map(cr => {
    const result = (cr as any).terms
      ? (cr as any).terms.reduce((acc: Amounts, t: { sectionTotalId: string; sign: 1 | -1 }) => {
          const src = totalsLookup[t.sectionTotalId] ?? ZERO
          return addAmounts(acc, { budget: t.sign * src.budget, actual: t.sign * src.actual, variance: t.sign * src.variance })
        }, ZERO)
      : { budget: cr.budget, actual: cr.actual, variance: cr.variance }
    totalsLookup[cr.id] = result
    return { ...cr, ...result }
  })

  return { ...data, sections, calculatedRows }
}

export default function HrDashboard({
  mode, period1, period2, deltaLabel, hrKpis, period1Full, period2Full,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<HrCat>('All')
  const [activeDept,     setActiveDept]     = useState<string>('all')

  // Extract unique dept names from HR data
  const deptOptions = useMemo(() => {
    const names = new Set<string>()
    for (const s of period1.data.sections) {
      for (const g of s.groups) names.add(g.deptFullName)
    }
    return Array.from(names).sort()
  }, [period1])

  // Apply filters
  const filteredP1 = useMemo(
    () => filterPLData(period1.data, activeCategory, activeDept),
    [period1, activeCategory, activeDept]
  )
  const filteredP2 = useMemo(
    () => filterPLData(period2.data, activeCategory, activeDept),
    [period2, activeCategory, activeDept]
  )

  const totals = useMemo(() => {
    let b = 0, a = 0
    for (const s of filteredP1.sections) {
      for (const g of s.groups) {
        for (const li of g.lineItems) { b += li.budget; a += li.actual }
      }
    }
    return { budget: b, actual: a }
  }, [filteredP1])

  const pctUsed = totals.budget > 0
    ? ((totals.actual / totals.budget) * 100).toFixed(1)
    : null

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">HR — People Cost Dashboard</h1>
          <p className="text-sm text-gray-500">{period1.label}</p>
        </div>
        <Suspense><PeriodSelector current={mode} /></Suspense>
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {HR_CATS.map(cat => {
          const kpi = hrKpis[cat] ?? { budget: 0, actual: 0 }
          const pct = kpi.budget > 0 ? (kpi.actual / kpi.budget * 100) : 0
          return (
            <div key={cat} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{cat}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{thb(kpi.actual)}</p>
              <p className="text-xs text-gray-400 mt-0.5">of {thb(kpi.budget)} budget</p>
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{pct.toFixed(1)}% used</p>
            </div>
          )
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
        {/* Department dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">
            Department
          </label>
          <select
            value={activeDept}
            onChange={e => setActiveDept(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
          >
            <option value="all">All Departments</option>
            {deptOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="h-4 w-px bg-gray-200 hidden sm:block" />

        {/* Category tabs */}
        <div className="flex items-center gap-1">
          {(['All', ...HR_CATS] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Totals */}
        <div className="ml-auto flex items-center gap-6 text-sm">
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold mr-1">Budget</span>
            <span className="font-bold tabular-nums">{thb(totals.budget)}</span>
          </div>
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold mr-1">Actual</span>
            <span className="font-bold tabular-nums">{thb(totals.actual)}</span>
          </div>
          {pctUsed && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold mr-1">Used</span>
              <span className={`font-bold tabular-nums ${Number(pctUsed) > 100 ? 'text-red-600' : 'text-emerald-700'}`}>
                {pctUsed}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* HR filtered P&L table */}
      <PLTable
        period1={{ label: period1.label, data: filteredP1 }}
        period2={{ label: period2.label, data: filteredP2 }}
        deltaLabel={deltaLabel}
        showCalculatedRows={false}
        defaultExpanded="all"
      />

      {/* Full P&L — read-only, all collapsed */}
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700 list-none flex items-center gap-2 py-2">
          <span className="group-open:rotate-90 transition-transform text-xs">▶</span>
          Full P&amp;L View (read-only)
        </summary>
        <div className="mt-3">
          <PLTable
            period1={period1Full}
            period2={period2Full}
            deltaLabel={deltaLabel}
          />
        </div>
      </details>
    </div>
  )
}
