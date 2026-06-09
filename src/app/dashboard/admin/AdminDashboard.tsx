'use client'

import { useState, Suspense } from 'react'
import type { PLData } from '@/lib/pl-types'
import PLTable, { type BudgetEditParams, type ActualEditParams } from '@/components/PLTable'
import PeriodSelector from '@/components/PeriodSelector'
import { adminUpdateBudget, adminUpdateActual, getLineItemHistory, type HistoryRow } from './actions'

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
  userId: string
}

interface HistoryPanel {
  lineItemId: string
  lineItemName: string
  rows: HistoryRow[]
  loading: boolean
}

export default function AdminDashboard({
  mode, period1, period2, deltaLabel, summaryCards,
}: Props) {
  const { revenue, grossProfit, opIncome, netIncome } = summaryCards
  const grossMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : null
  const netMargin   = revenue > 0 ? ((netIncome / revenue) * 100).toFixed(1) : null

  const [history, setHistory] = useState<HistoryPanel | null>(null)

  async function handleRowClick(lineItemId: string, lineItemName: string) {
    setHistory({ lineItemId, lineItemName, rows: [], loading: true })
    const rows = await getLineItemHistory(lineItemId)
    setHistory(prev => prev?.lineItemId === lineItemId ? { ...prev, rows, loading: false } : prev)
  }

  async function handleBudgetSave(p: BudgetEditParams) {
    await adminUpdateBudget({
      lineItemId:   p.lineItemId,
      departmentId: p.departmentId,
      year:         p.year,
      month:        p.month,
      amount:       p.amount,
    })
  }

  async function handleActualSave(p: ActualEditParams) {
    await adminUpdateActual({
      lineItemId: p.lineItemId,
      monthDate:  p.monthDate,
      amount:     p.amount,
    })
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Admin — P&amp;L</h1>
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

      {/* Editable P&L Table */}
      <PLTable
        period1={period1}
        period2={period2}
        deltaLabel={deltaLabel}
        onBudgetSave={handleBudgetSave}
        onActualSave={handleActualSave}
        onRowClick={handleRowClick}
      />

      {/* History panel */}
      {history && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">{history.lineItemName}</h3>
              <p className="text-xs text-gray-500">Budget history</p>
            </div>
            <button
              onClick={() => setHistory(null)}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {history.loading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : history.rows.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No budget history</div>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Period</th>
                    <th className="px-3 py-2 text-right text-gray-500 font-medium">Amount</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
                    <th className="px-3 py-2 text-left text-gray-500 font-medium">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.rows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">
                        {MONTHS[r.month - 1]} {r.year}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {thb(r.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                          r.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                          : r.status === 'rejected' ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[80px]">
                        {r.submittedByName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setHistory(null)} />
      )}
    </div>
  )
}
