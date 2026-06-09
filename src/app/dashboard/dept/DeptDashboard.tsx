'use client'

import { Suspense, useState, useTransition } from 'react'
import type { PLData } from '@/lib/pl-types'
import PLTable from '@/components/PLTable'
import PeriodSelector from '@/components/PeriodSelector'
import { submitCategoryBudgets } from './actions'

function thb(n: number) { return `฿${Math.round(n).toLocaleString('en-US')}` }

interface KPI {
  totalBudget: number
  actualSpent: number
  variance:    number
}

interface Props {
  deptName:   string
  mode:       string
  period1:    { label: string; data: PLData }
  period2:    { label: string; data: PLData }
  deltaLabel: string
  kpi:        KPI
}

export default function DeptDashboard({
  deptName, mode, period1, period2, deltaLabel, kpi,
}: Props) {
  const pctUsed = kpi.totalBudget > 0
    ? ((kpi.actualSpent / kpi.totalBudget) * 100).toFixed(1)
    : null

  const [showModal, setShowModal] = useState(false)

  // Collect all line items from filtered PLData for the budget form
  const allLineItems = period1.data.sections.flatMap(s =>
    s.groups.flatMap(g =>
      g.lineItems.map(li => ({
        lineItemId:   li.lineItemId,
        name:         li.name,
        sectionTitle: s.title,
        currentBudget: li.budget,
      }))
    )
  )

  const [budgetAmounts, setBudgetAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const li of allLineItems) {
      if (li.currentBudget > 0) init[li.lineItemId] = String(li.currentBudget)
    }
    return init
  })

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmitBudget() {
    setSubmitError(null)
    const amounts = allLineItems
      .filter(li => budgetAmounts[li.lineItemId] !== undefined && budgetAmounts[li.lineItemId].trim() !== '')
      .map(li => ({
        lineItemId: li.lineItemId,
        amount:     parseFloat(budgetAmounts[li.lineItemId]) || 0,
      }))
      .filter(x => x.amount > 0)

    if (amounts.length === 0) {
      setSubmitError('Enter at least one budget amount before submitting.')
      return
    }

    const { year, month } = period1.data
    startTransition(async () => {
      try {
        await submitCategoryBudgets(amounts, year, month)
        setShowModal(false)
      } catch (e: unknown) {
        setSubmitError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
      }
    })
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{deptName}</h1>
          <p className="text-sm text-gray-500">{period1.label} P&amp;L View</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Submit Budget
          </button>
          <Suspense><PeriodSelector current={mode} /></Suspense>
        </div>
      </div>

      {/* KPI cards */}
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
          {pctUsed && (
            <div className="mt-2 h-2 rounded-full overflow-hidden bg-gray-100">
              <div
                className={`h-full rounded-full ${Number(pctUsed) > 100 ? 'bg-red-500' : Number(pctUsed) > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(Number(pctUsed), 100)}%` }}
              />
            </div>
          )}
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

      {/* P&L table — dept rows pre-expanded */}
      <PLTable
        period1={period1}
        period2={period2}
        deltaLabel={deltaLabel}
        showCalculatedRows={false}
        defaultExpanded="all"
      />

      {/* Submit Budget modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col z-10">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">Submit Budget — {deptName}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{period1.label}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {allLineItems.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm">No line items found for your department.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="pb-2 text-xs font-medium text-gray-500">Line Item</th>
                      <th className="pb-2 text-xs font-medium text-gray-500 text-right w-40">Budget (THB)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allLineItems.map(li => (
                      <tr key={li.lineItemId}>
                        <td className="py-2 text-gray-800">{li.name}</td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={budgetAmounts[li.lineItemId] ?? ''}
                            onChange={e => setBudgetAmounts(prev => ({
                              ...prev, [li.lineItemId]: e.target.value,
                            }))}
                            placeholder="0"
                            className="w-full text-right rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              {submitError ? (
                <p className="text-sm text-red-600">{submitError}</p>
              ) : (
                <p className="text-xs text-gray-400">Submitted budgets go to CEO for approval</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitBudget}
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Submitting…' : 'Submit for Approval'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
