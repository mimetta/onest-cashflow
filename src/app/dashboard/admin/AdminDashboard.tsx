'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import type { PLData, MonthColumn } from '@/lib/pl-types'
import PLTable from '@/components/PLTable'
import PeriodFilter from '@/components/PeriodFilter'

function thb(n: number) { return `฿${Math.round(Math.abs(n)).toLocaleString('en-US')}` }

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

// ── History drawer types ────────────────────────────────────────────────────────

type HistoryEntry = {
  id: string
  amount: number
  status: string
  version: number
  submitted_at: string | null
  note: string | null
  submitted_by_name: string
}

type MonthHistory = {
  month: string    // "YYYY-MM-DD"
  budget: number
  actual: number
  variance: number
  entries: HistoryEntry[]
}

type HistoryData = {
  lineItem: { name: string; categoryName: string; deptName: string }
  months: MonthHistory[]
}

type Drawer = {
  lineItemId:    string
  lineItemName:  string
  loading:       boolean
  error:         string | null
  data:          HistoryData | null
  selectedMonth: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtMonthKey(s: string): string {
  const [y, m] = s.split('-').map(Number)
  return `${MN[m - 1]} ${y}`
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
         ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status: string, isCurrent: boolean) {
  if (isCurrent)              return { label: 'active',   cls: 'bg-[#1e2a3a]/10 text-[#1e2a3a]' }
  if (status === 'approved')  return { label: 'approved', cls: 'bg-emerald-100 text-emerald-700' }
  if (status === 'submitted') return { label: 'pending',  cls: 'bg-amber-100 text-amber-700' }
  return                             { label: 'rejected', cls: 'bg-red-100 text-red-600' }
}

function dotCls(status: string, isCurrent: boolean): string {
  if (isCurrent)              return 'bg-[#1e2a3a]'
  if (status === 'approved')  return 'bg-emerald-500'
  if (status === 'submitted') return 'bg-amber-400'
  return 'bg-gray-300'
}

// ── Main component ─────────────────────────────────────────────────────────────

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
  userId?:     string
}

export default function AdminDashboard({
  mode, anchor = '', months, period1, period2, deltaLabel, summaryCards,
}: Props) {
  const { revenue, grossProfit, opIncome, netProfit } = summaryCards
  const grossMargin = revenue.budget > 0 ? `${((grossProfit.budget / revenue.budget) * 100).toFixed(1)}% margin` : undefined
  const netMargin   = revenue.budget > 0 ? `${((netProfit.budget  / revenue.budget) * 100).toFixed(1)}% net margin` : undefined

  const periodLabel = months
    ? months[months.length - 1].label
    : (period1?.label ?? '')

  const [drawer, setDrawer] = useState<Drawer | null>(null)

  async function handleRowClick(lineItemId: string, lineItemName: string) {
    setDrawer({ lineItemId, lineItemName, loading: true, error: null, data: null, selectedMonth: null })
    try {
      const res  = await fetch(`/api/pl/history?line_item_id=${encodeURIComponent(lineItemId)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load history')
      const data = json as HistoryData
      setDrawer(prev =>
        prev?.lineItemId === lineItemId
          ? { ...prev, loading: false, data, selectedMonth: data.months[0]?.month ?? null }
          : prev
      )
    } catch (e: any) {
      setDrawer(prev =>
        prev?.lineItemId === lineItemId
          ? { ...prev, loading: false, error: e.message }
          : prev
      )
    }
  }

  async function handleStatusChange(entryId: string, newStatus: 'approved' | 'rejected') {
    if (!drawer) return
    const res  = await fetch('/api/pl/history', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: entryId, status: newStatus }),
    })
    if (!res.ok) return
    // Refresh drawer data
    const refresh  = await fetch(`/api/pl/history?line_item_id=${encodeURIComponent(drawer.lineItemId)}`)
    const json     = await refresh.json()
    if (refresh.ok) {
      const data = json as HistoryData
      setDrawer(prev => prev ? { ...prev, data, selectedMonth: prev.selectedMonth } : prev)
    }
  }

  // ── Drawer render ─────────────────────────────────────────────────────────

  function renderDrawer() {
    if (!drawer) return null

    const activeMH: MonthHistory | undefined = drawer.data?.months.find(
      m => m.month === drawer.selectedMonth
    )

    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/10" onClick={() => setDrawer(null)} />
        <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">

          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm truncate">
                  {drawer.data?.lineItem.name ?? drawer.lineItemName}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Budget history
                  {drawer.data?.lineItem.deptName && (
                    <> · {drawer.data.lineItem.deptName}</>
                  )}
                  {drawer.data?.lineItem.categoryName && (
                    <> · {drawer.data.lineItem.categoryName}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => setDrawer(null)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </div>

          {drawer.loading && (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Loading…
            </div>
          )}

          {drawer.error && (
            <div className="flex-1 flex items-center justify-center px-6">
              <p className="text-sm text-red-500 text-center">{drawer.error}</p>
            </div>
          )}

          {!drawer.loading && !drawer.error && drawer.data && (
            <div className="flex-1 overflow-y-auto flex flex-col">

              {/* Month tabs */}
              {drawer.data.months.length > 0 ? (
                <>
                  <div className="flex gap-1 overflow-x-auto px-4 pt-3 pb-0 border-b border-gray-100 flex-shrink-0">
                    {drawer.data.months.map(mh => (
                      <button
                        key={mh.month}
                        onClick={() => setDrawer(prev => prev ? { ...prev, selectedMonth: mh.month } : prev)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-md whitespace-nowrap transition-colors border border-b-0 ${
                          mh.month === drawer.selectedMonth
                            ? 'bg-white border-gray-200 text-gray-900 -mb-px'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {fmtMonthKey(mh.month)}
                      </button>
                    ))}
                  </div>

                  {activeMH ? (
                    <div className="flex-1 overflow-y-auto">
                      {/* KPI cards */}
                      <div className="grid grid-cols-3 gap-3 px-4 py-4">
                        {[
                          { label: 'Budget',   value: activeMH.budget,   color: 'text-gray-900' },
                          { label: 'Actual',   value: activeMH.actual,   color: 'text-gray-900' },
                          { label: 'Variance', value: activeMH.variance,
                            color: activeMH.variance >= 0 ? 'text-emerald-600' : 'text-red-500' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                            <p className={`mt-1 text-sm font-bold tabular-nums ${color}`}>
                              {value < 0 ? '-' : ''}{thb(value)}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Version timeline */}
                      {activeMH.entries.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-gray-400 text-center">
                          No budget history for this period
                        </p>
                      ) : (
                        <div className="px-4 pb-6">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                            Version history
                          </p>
                          <div className="relative">
                            {activeMH.entries.map((entry, i) => {
                              const isCurrentActive =
                                i === 0 && entry.status === 'approved'
                              const badge = statusBadge(entry.status, isCurrentActive)
                              const prevAmt = activeMH.entries[i + 1]?.amount
                              const delta   = prevAmt != null ? entry.amount - prevAmt : null
                              const isPending = entry.status === 'submitted'

                              return (
                                <div key={entry.id} className="flex gap-3 mb-4 last:mb-0">
                                  {/* Dot + line */}
                                  <div className="flex flex-col items-center flex-shrink-0 w-4">
                                    <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 ${dotCls(entry.status, isCurrentActive)}`} />
                                    {i < activeMH.entries.length - 1 && (
                                      <div className="w-px flex-1 bg-gray-200 mt-1" />
                                    )}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0 pb-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-[10px] text-gray-500">v{entry.version}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.cls}`}>
                                          {badge.label}
                                        </span>
                                      </div>
                                      <span className="text-sm font-semibold tabular-nums text-gray-900 flex-shrink-0">
                                        {thb(entry.amount)}
                                      </span>
                                    </div>

                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                      {entry.submitted_by_name}
                                      {entry.submitted_at && (
                                        <> · {fmtDateTime(entry.submitted_at)}</>
                                      )}
                                    </p>

                                    {delta != null && delta !== 0 && (
                                      <p className={`text-[11px] mt-0.5 font-medium ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {delta > 0 ? '↑' : '↓'} {thb(Math.abs(delta))} from previous
                                      </p>
                                    )}

                                    {entry.note && (
                                      <p className="text-[11px] text-gray-400 italic mt-0.5 truncate" title={entry.note}>
                                        {entry.note}
                                      </p>
                                    )}

                                    {/* Pending actions */}
                                    {isPending && (
                                      <div className="flex gap-2 mt-2">
                                        <button
                                          onClick={() => handleStatusChange(entry.id, 'approved')}
                                          className="px-2.5 py-1 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => handleStatusChange(entry.id, 'rejected')}
                                          className="px-2.5 py-1 text-[11px] font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center px-6">
                  <p className="text-sm text-gray-400 text-center">No budget history found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Admin — P&amp;L</h1>
        <div className="flex items-center gap-3">
          {/* Import Data — always visible */}
          <Link
            href="/dashboard/admin/import"
            className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-white transition-colors"
          >
            Import Data
          </Link>

          {/* More actions dropdown */}
          <div className="relative">
            <button
              onClick={() => setDrawer(d => d === null ? { lineItemId: '__menu__', lineItemName: '', loading: false, error: null, data: null, selectedMonth: null } : null)}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-white transition-colors"
              aria-label="More actions"
            >
              ···
            </button>
            {drawer?.lineItemId === '__menu__' && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setDrawer(null)} />
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[160px] z-40">
                  {[
                    { href: '/dashboard/admin/settings',  label: 'Settings' },
                    { href: '/dashboard/admin/line-items', label: 'Line Items' },
                    { href: '/dashboard/admin/users',      label: 'Manage Users' },
                  ].map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawer(null)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>

          <Suspense><PeriodFilter mode={mode} anchor={anchor ?? ''} /></Suspense>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Revenue"    budget={revenue.budget}     actual={revenue.actual}     sub={periodLabel} accent="blue" />
        <KpiCard title="Gross Profit"     budget={grossProfit.budget} actual={grossProfit.actual} sub={grossMargin}  accent="green" />
        <KpiCard title="Operating Income" budget={opIncome.budget}    actual={opIncome.actual}                       accent="amber" />
        <KpiCard title="Net Profit"       budget={netProfit.budget}   actual={netProfit.actual}   sub={netMargin}    accent="dynamic" />
      </div>

      {/* Editable P&L table */}
      {months ? (
        <PLTable months={months} role="admin" onRowClick={handleRowClick} />
      ) : period1 ? (
        <PLTable period1={period1} period2={period2} deltaLabel={deltaLabel} role="admin" onRowClick={handleRowClick} />
      ) : null}

      {/* History slide-over */}
      {renderDrawer()}
    </div>
  )
}
