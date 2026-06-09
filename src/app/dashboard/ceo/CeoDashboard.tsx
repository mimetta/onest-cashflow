'use client'

import { Suspense } from 'react'
import type { PLData } from '@/lib/pl-types'
import type { PendingRow } from './page'
import PLTable from '@/components/PLTable'
import PeriodSelector from '@/components/PeriodSelector'
import { approveSubmission, rejectSubmission } from './actions'

function thb(n: number) {
  return `฿${Math.round(n).toLocaleString('en-US')}`
}

function SummaryCard({ title, value, sub }: { title: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{thb(value)}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  mode: string
  period1: { label: string; data: PLData }
  period2: { label: string; data: PLData }
  deltaLabel: string
  summaryCards: { revenue: number; grossProfit: number; opIncome: number; netIncome: number }
  pendingSubmissions: PendingRow[]
}

export default function CeoDashboard({
  mode, period1, period2, deltaLabel, summaryCards, pendingSubmissions,
}: Props) {
  const { revenue, grossProfit, opIncome, netIncome } = summaryCards
  const grossMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : null
  const netMargin   = revenue > 0 ? ((netIncome / revenue) * 100).toFixed(1) : null

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">P&amp;L Dashboard</h1>
        <Suspense>
          <PeriodSelector current={mode} />
        </Suspense>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Total Revenue" value={revenue} sub={`${period1.label} actual`} />
        <SummaryCard title="Gross Profit" value={grossProfit} sub={grossMargin ? `${grossMargin}% margin` : undefined} />
        <SummaryCard title="Operating Income" value={opIncome} />
        <SummaryCard title="Net Income" value={netIncome} sub={netMargin ? `${netMargin}% net margin` : undefined} />
      </div>

      {/* P&L Table */}
      <PLTable
        period1={period1}
        period2={period2}
        deltaLabel={deltaLabel}
      />

      {/* Pending approvals */}
      {pendingSubmissions.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            Pending Approvals ({pendingSubmissions.length})
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Department</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Line Item</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Period</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase">Amount</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase">Submitted By</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingSubmissions.map(row => (
                  <PendingApprovalRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function PendingApprovalRow({ row }: { row: PendingRow }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-2.5 text-gray-700">{row.departmentName}</td>
      <td className="px-4 py-2.5">
        <div className="font-medium text-gray-900">{row.lineItemName}</div>
        <div className="text-xs text-gray-400">{row.categoryName}</div>
      </td>
      <td className="px-4 py-2.5 text-gray-600">
        {MONTHS[row.month - 1]} {row.year}
      </td>
      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
        {thb(row.amount)}
      </td>
      <td className="px-4 py-2.5 text-gray-600">{row.submittedByName}</td>
      <td className="px-4 py-2.5">
        <div className="flex justify-center gap-2">
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
  )
}
