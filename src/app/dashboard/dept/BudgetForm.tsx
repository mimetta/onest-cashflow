'use client'

import { useState, useTransition } from 'react'
import { submitCategoryBudgets } from './actions'
import type { Department, Category, LineItem, User, BudgetSubmission } from '@/types'

interface CategoryGroup {
  category: Category
  items: LineItem[]
}

interface Props {
  user: User
  department: Department
  groups: CategoryGroup[]
  submissions: BudgetSubmission[]
  expensesByLineItem: Record<string, number>
  year: number
  month: number
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function BudgetForm({ department, groups, submissions, expensesByLineItem, year, month }: Props) {
  // Budget amount state keyed by line_item_id
  const [budgetValues, setBudgetValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const s of submissions) {
      init[s.line_item_id] = String(s.amount)
    }
    return init
  })

  const [submitting, setSubmitting] = useState<Record<string, boolean>>({})
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()

  function getSubmission(lineItemId: string) {
    return submissions.find(s => s.line_item_id === lineItemId)
  }

  async function handleSubmitCategory(categoryId: string, items: LineItem[]) {
    const amounts = items
      .filter(item => {
        const v = budgetValues[item.id]
        return v !== undefined && v.trim() !== ''
      })
      .map(item => ({
        lineItemId:   item.id,
        departmentId: department.id,
        amount:       parseFloat(budgetValues[item.id]) || 0,
      }))

    if (amounts.length === 0) {
      setSubmitErrors(prev => ({ ...prev, [categoryId]: 'Enter at least one budget amount before submitting.' }))
      return
    }

    setSubmitting(prev => ({ ...prev, [categoryId]: true }))
    setSubmitErrors(prev => ({ ...prev, [categoryId]: '' }))

    startTransition(async () => {
      try {
        await submitCategoryBudgets(amounts, year, month)
      } catch {
        setSubmitErrors(prev => ({ ...prev, [categoryId]: 'Submission failed. Please try again.' }))
      } finally {
        setSubmitting(prev => ({ ...prev, [categoryId]: false }))
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">{department.full_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {MONTH_NAMES[month]} {year} — Budget &amp; Actuals
          </p>
        </div>

        {/* Category groups */}
        {groups.length === 0 ? (
          <p className="text-center py-16 text-gray-400 text-sm">No line items found for your department.</p>
        ) : (
          groups.map(({ category, items }) => {
            const isSubmitting = submitting[category.id]
            const submitError = submitErrors[category.id]

            const allPending = items.length > 0 && items.every(item => {
              const s = getSubmission(item.id)
              return s?.status === 'submitted'
            })

            return (
              <div key={category.id} className="mb-6 rounded-lg border border-gray-200 bg-white overflow-hidden">

                {/* Category header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {category.name}
                  </span>
                  <div className="flex items-center gap-3">
                    {submitError && (
                      <span className="text-xs text-red-600">{submitError}</span>
                    )}
                    {allPending && (
                      <span className="text-xs text-amber-600">Pending CEO Approval</span>
                    )}
                    <button
                      onClick={() => handleSubmitCategory(category.id, items)}
                      disabled={isSubmitting}
                      className="text-xs font-medium px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting ? 'Submitting…' : 'Submit Budget'}
                    </button>
                  </div>
                </div>

                {/* Table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-4 py-2 text-xs font-medium text-gray-400">Line Item</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-400 w-52">Budget (THB)</th>
                      <th className="px-4 py-2 text-xs font-medium text-gray-400 w-36">Actual (THB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const submission = getSubmission(item.id)
                      const displayName = item.subcategory_l1 || item.name
                      const isPending = submission?.status === 'submitted'
                      const isApproved = submission?.status === 'approved'
                      const actual = expensesByLineItem[item.id] ?? 0

                      return (
                        <tr key={item.id} className={idx % 2 === 1 ? 'bg-gray-50/50' : ''}>

                          {/* Line item name */}
                          <td className="px-4 py-2.5 text-gray-800">
                            {displayName}
                          </td>

                          {/* Budget input */}
                          <td className="px-4 py-2.5">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                Pending CEO Approval
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={budgetValues[item.id] ?? ''}
                                  onChange={e => setBudgetValues(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  placeholder="0"
                                  className={[
                                    'w-36 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1',
                                    isApproved
                                      ? 'border-green-300 bg-green-50 focus:ring-green-400'
                                      : 'border-gray-200 bg-white focus:ring-blue-400',
                                  ].join(' ')}
                                />
                                {isApproved && (
                                  <span className="text-xs text-green-600 font-medium">Approved</span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Actual — read-only, calculated from approved expenses */}
                          <td className="px-4 py-2.5">
                            <span className="text-sm text-gray-800">
                              {actual.toLocaleString()}
                            </span>
                            <span className="block text-xs text-gray-400 mt-0.5">Manual</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
