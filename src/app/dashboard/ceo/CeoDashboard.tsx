'use client'

import { Suspense, useState } from 'react'
import type { PLData, MonthColumn } from '@/lib/pl-types'
import type { PendingRow } from './page'
import PLTable from '@/components/PLTable'
import PeriodFilter from '@/components/PeriodFilter'
import { approveSubmission, rejectSubmission } from './actions'

function thb(n: number) { return `฿${Math.round(n).toLocaleString('en-US')}` }

type Accent = 'blue' | 'green' | 'amber' | 'dynamic'

function KpiCard({ title, budget, actual, sub, accent }: {
  title: string; budget: number; actual: number; sub?: string; accent?: Accent
}) {
  const borderCls = accent === 'blue'    ? 'border-l-blue-400'
    : accent === 'green'   ? 'border-l-emerald-400'
    : accent === 'amber'   ? 'border-l-amber-400'
    : accent === 'dynamic' ? (budget >= 0 ? 'border-l-emerald-400' : 'border-l-red-500')
    : 'border-l-gray-200'
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 shadow-sm p-5 ${borderCls}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{thb(budget)}</p>
      {actual !== 0 && (
        <p className="mt-0.5 text-sm font-medium text-gray-500 tabular-nums">
          {thb(actual)} <span className="text-xs font-normal text-gray-400">actual</span>
        </p>
      )}
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  mode:        string
  anchor?:     string
  months?:     MonthColumn[]
  period1?:    { label: string; data: PLData }
  period2?:    { label: string; data: PLData }
  deltaLabel?: string
  summaryCards: {
    revenue:     { budget: number; actual: number }
    grossProfit: { budget: number; actual: number }
    opIncome:    { budget: number; actual: number }
    netProfit:   { budget: number; actual: number }
  }
  hrPeriod1:   { label: string; data: PLData }
  hrPeriod2:   { label: string; data: PLData }
  hrKpis:      { budget: number; actual: number; revenue: number }
  pendingSubmissions: PendingRow[]
}

export default function CeoDashboard({
  mode, anchor = '', months, period1, period2, deltaLabel,
  summaryCards, hrPeriod1, hrPeriod2, hrKpis, pendingSubmissions,
}: Props) {
  const { revenue, grossProfit, opIncome, netProfit } = summaryCards
  const grossMargin = revenue.budget > 0 ? `${((grossProfit.budget / revenue.budget) * 100).toFixed(1)}% margin` : undefined
  const netMargin   = revenue.budget > 0 ? `${((netProfit.budget  / revenue.budget) * 100).toFixed(1)}% net margin` : undefined
  const hrVariance  = hrKpis.budget - hrKpis.actual
  const hrPct       = hrKpis.revenue > 0 ? `${(hrKpis.actual / hrKpis.revenue * 100).toFixed(1)}% of revenue` : undefined

  const periodLabel = months
    ? months[months.length - 1].label
    : (period1?.label ?? '')

  const [activeTab, setActiveTab] = useState<'pl' | 'hr'>('pl')

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">P&amp;L Dashboard</h1>
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => setActiveTab('pl')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'pl'
                  ? 'bg-[#1e2a3a] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              P&amp;L Overview
            </button>
            <button
              onClick={() => setActiveTab('hr')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'hr'
                  ? 'bg-[#1e2a3a] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              HR Costs
            </button>
          </div>
        </div>
        <Suspense><PeriodFilter mode={mode} anchor={anchor ?? ''} /></Suspense>
      </div>

      {activeTab === 'pl' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total Revenue"    budget={revenue.budget}     actual={revenue.actual}     sub={periodLabel} accent="blue" />
            <KpiCard title="Gross Profit"     budget={grossProfit.budget} actual={grossProfit.actual} sub={grossMargin}  accent="green" />
            <KpiCard title="Operating Income" budget={opIncome.budget}    actual={opIncome.actual}                       accent="amber" />
            <KpiCard title="Net Profit"       budget={netProfit.budget}   actual={netProfit.actual}   sub={netMargin}    accent="dynamic" />
          </div>

          {months ? (
            <PLTable months={months} role="ceo" />
          ) : period1 ? (
            <PLTable period1={period1} period2={period2} deltaLabel={deltaLabel} role="ceo" />
          ) : null}

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              Pending Approvals
              {pendingSubmissions.length > 0 && (
                <span className="ml-2 text-xs font-normal text-amber-600">
                  ({pendingSubmissions.length})
                </span>
              )}
            </h2>
            {pendingSubmissions.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">No pending approvals</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Department','Line Item','Period','Amount','Submitted By','Actions'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingSubmissions.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700">{row.departmentName}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900">{row.lineItemName}</div>
                          <div className="text-xs text-gray-400">{row.categoryName}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                          {MONTHS[row.month - 1]} {row.year}
                        </td>
                        <td className="px-4 py-2.5 font-medium tabular-nums whitespace-nowrap">
                          {thb(row.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{row.submittedByName}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-2">
                            <form action={approveSubmission.bind(null, row.id)}>
                              <button className="px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors">
                                Approve
                              </button>
                            </form>
                            <form action={rejectSubmission.bind(null, row.id, '')}>
                              <button className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                                Reject
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'hr' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="HR Budget"       budget={hrKpis.budget}  actual={0} sub={hrPeriod1.label} />
            <KpiCard title="HR Actual"       budget={hrKpis.actual}  actual={0} sub={hrPct} />
            <KpiCard title="Budget Variance" budget={hrVariance}     actual={0} sub={hrVariance >= 0 ? 'under budget' : 'over budget'} />
            <KpiCard title="HR Headcount %"  budget={hrKpis.revenue > 0 ? hrKpis.actual : 0} actual={0} sub={hrPct ?? 'n/a'} />
          </div>
          <PLTable period1={hrPeriod1} period2={hrPeriod2} deltaLabel={deltaLabel} defaultExpanded="all" />
        </>
      )}
    </div>
  )
}
