'use client'

import { Fragment, useMemo } from 'react'
import type { PLData, PLSectionData, PLGroupData, PLLineItemRow, PLCalcRowData, Amounts } from '@/lib/pl-types'
import { ZERO } from '@/lib/pl-types'
import EditableCell from './EditableCell'

// ── Formatting ────────────────────────────────────────────────────────────────

function thb(n: number) {
  return `฿${Math.round(n).toLocaleString('en-US')}`
}

function pctStr(value: number, base: number): string | null {
  if (base === 0) return null
  return `${(value / base * 100).toFixed(1)}%`
}

function deltaInfo(p1: number, p2: number) {
  if (p1 === 0 && p2 === 0) return { text: '—', tone: 'neutral' as const }
  if (p2 === 0) return { text: 'n/a', tone: 'neutral' as const }
  const d = (p1 - p2) / Math.abs(p2) * 100
  const tone = Math.abs(d) < 0.05 ? ('neutral' as const) : d > 0 ? ('pos' as const) : ('neg' as const)
  return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, tone }
}

function isRevSection(sectionId: string) {
  return sectionId === 'revenue_channel' || sectionId === 'revenue_product'
}

// ── P2 lookup builder ─────────────────────────────────────────────────────────

type P2Lookups = {
  items:         Record<string, Amounts>
  groupSubs:     Record<string, Amounts>   // key: `${sectionId}|${deptFullName}`
  sectionTotals: Record<string, Amounts>   // key: sectionId
  calcRows:      Record<string, Amounts>   // key: calcRow.id
  grossBudget:   number
  grossActual:   number
}

function buildP2Lookups(data: PLData): P2Lookups {
  const lookups: P2Lookups = {
    items: {}, groupSubs: {}, sectionTotals: {}, calcRows: {},
    grossBudget: 0, grossActual: 0,
  }
  for (const section of data.sections) {
    lookups.sectionTotals[section.id] = section.total
    if (section.id === 'revenue_channel') {
      lookups.grossBudget = section.total.budget
      lookups.grossActual = section.total.actual
    }
    for (const group of section.groups) {
      lookups.groupSubs[`${section.id}|${group.deptFullName}`] = group.subtotal
      for (const item of group.lineItems) {
        lookups.items[item.lineItemId] = { budget: item.budget, actual: item.actual, variance: item.variance }
      }
    }
  }
  for (const row of data.calculatedRows) {
    lookups.calcRows[row.id] = { budget: row.budget, actual: row.actual, variance: row.variance }
  }
  return lookups
}

// ── Cell primitives ───────────────────────────────────────────────────────────

const dim = 'text-gray-300'
const num = 'text-right tabular-nums text-sm whitespace-nowrap'

function AmtTd({ value, py = 'py-1.5', editable, onSave }: {
  value: number; py?: string; editable?: boolean; onSave?: (v: number) => Promise<void>
}) {
  return (
    <td className={`${num} px-3 ${py}`} onClick={e => editable && e.stopPropagation()}>
      {editable && onSave
        ? <EditableCell value={value} onSave={onSave} />
        : value === 0 ? <span className={dim}>—</span> : thb(value)}
    </td>
  )
}

function PctTd({ value, base, py = 'py-1.5' }: { value: number; base: number; py?: string }) {
  const p = pctStr(value, base)
  return (
    <td className={`${num} px-2 ${py} text-xs text-gray-500`}>
      {p ?? <span className={dim}>—</span>}
    </td>
  )
}

function DeltaTd({ p1, p2, revCtx, py = 'py-1.5' }: {
  p1: number; p2: number; revCtx: boolean; py?: string
}) {
  const { text, tone } = deltaInfo(p1, p2)
  const color = tone === 'neutral' ? 'text-gray-400'
    : (revCtx ? tone === 'pos' : tone === 'neg') ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'
  return (
    <td className={`${num} px-3 ${py} text-xs ${color}`}>{text}</td>
  )
}

// ── Period column group ───────────────────────────────────────────────────────

interface PeriodColsProps {
  a: Amounts
  grossBudget: number
  grossActual: number
  py?: string
  editable?: boolean
  onBudgetSave?: (v: number) => Promise<void>
  onActualSave?: (v: number) => Promise<void>
}

function PeriodCols({ a, grossBudget, grossActual, py = 'py-1.5', editable, onBudgetSave, onActualSave }: PeriodColsProps) {
  return (
    <>
      <AmtTd value={a.budget} py={py} editable={editable} onSave={onBudgetSave} />
      <PctTd value={a.budget} base={grossBudget} py={py} />
      <AmtTd value={a.actual} py={py} editable={editable} onSave={onActualSave} />
      <PctTd value={a.actual} base={grossActual} py={py} />
    </>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface BudgetEditParams {
  lineItemId: string
  departmentId: string
  year: number
  month: number
  amount: number
}

export interface ActualEditParams {
  lineItemId: string
  monthDate: string   // 'YYYY-MM-01'
  amount: number
}

export interface PLTableProps {
  period1: { label: string; data: PLData }
  period2?: { label: string; data: PLData }
  deltaLabel?: string
  /** Admin: inline budget editing. Disables when period2 is an aggregate (QoQ/YoY edit not supported). */
  onBudgetSave?: (p: BudgetEditParams) => Promise<void>
  onActualSave?: (p: ActualEditParams) => Promise<void>
  /** Admin: click a row to open history panel. */
  onRowClick?: (lineItemId: string, lineItemName: string) => void
  showCalculatedRows?: boolean
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PLTable({
  period1, period2, deltaLabel = 'Δ%',
  onBudgetSave, onActualSave, onRowClick,
  showCalculatedRows = true,
}: PLTableProps) {
  const p2 = useMemo(
    () => period2 ? buildP2Lookups(period2.data) : null,
    [period2]
  )

  const p1GrossBudget = period1.data.sections.find(s => s.id === 'revenue_channel')?.total.budget ?? 0
  const p1GrossActual = period1.data.sections.find(s => s.id === 'revenue_channel')?.total.actual ?? 0

  const hasPeriod2 = p2 !== null
  const totalCols  = hasPeriod2 ? 10 : 5
  const editable   = Boolean(onBudgetSave || onActualSave) && !hasPeriod2

  const { year, month } = period1.data
  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderLineItem(item: PLLineItemRow, group: PLGroupData, section: PLSectionData) {
    const p2Amounts = p2?.items[item.lineItemId] ?? ZERO
    const revCtx    = isRevSection(section.id)
    const clickable = Boolean(onRowClick)

    return (
      <tr
        key={item.lineItemId}
        onClick={() => onRowClick?.(item.lineItemId, item.name)}
        className={`border-b border-gray-100 ${
          clickable ? 'cursor-pointer hover:bg-indigo-50' : 'hover:bg-gray-50'
        }`}
      >
        <td className="pl-8 pr-3 py-1.5 text-sm text-gray-700">
          <div className="font-medium">{item.name}</div>
          {item.subcategoryL1 && (
            <div className="text-xs text-gray-400 mt-0.5">{item.subcategoryL1}</div>
          )}
        </td>
        <PeriodCols
          a={item}
          grossBudget={p1GrossBudget}
          grossActual={p1GrossActual}
          editable={editable}
          onBudgetSave={onBudgetSave ? v => onBudgetSave({ lineItemId: item.lineItemId, departmentId: group.departmentId, year, month, amount: v }) : undefined}
          onActualSave={onActualSave ? v => onActualSave({ lineItemId: item.lineItemId, monthDate, amount: v }) : undefined}
        />
        {hasPeriod2 && (
          <>
            <PeriodCols
              a={p2Amounts}
              grossBudget={p2!.grossBudget}
              grossActual={p2!.grossActual}
            />
            <DeltaTd p1={item.actual} p2={p2Amounts.actual} revCtx={revCtx} />
          </>
        )}
      </tr>
    )
  }

  function renderGroupSubtotal(group: PLGroupData, section: PLSectionData) {
    const p2Amounts = p2?.groupSubs[`${section.id}|${group.deptFullName}`] ?? ZERO
    const revCtx    = isRevSection(section.id)
    return (
      <tr key={`sub-${section.id}-${group.deptFullName}`} className="border-b border-gray-200 bg-gray-50">
        <td className="pl-6 pr-3 py-1.5 text-sm font-semibold text-gray-600 italic">
          {group.subtotalLabel}
        </td>
        <PeriodCols a={group.subtotal} grossBudget={p1GrossBudget} grossActual={p1GrossActual} />
        {hasPeriod2 && (
          <>
            <PeriodCols a={p2Amounts} grossBudget={p2!.grossBudget} grossActual={p2!.grossActual} />
            <DeltaTd p1={group.subtotal.actual} p2={p2Amounts.actual} revCtx={revCtx} />
          </>
        )}
      </tr>
    )
  }

  function renderSectionTotal(section: PLSectionData) {
    const p2Amounts = p2?.sectionTotals[section.id] ?? ZERO
    const revCtx    = isRevSection(section.id)
    return (
      <tr key={`total-${section.id}`} className="border-b-2 border-gray-300 bg-gray-100">
        <td className="px-3 py-2 text-sm font-bold text-gray-800 uppercase tracking-wide">
          {section.totalLabel}
          {section.note && <span className="ml-2 text-xs font-normal text-gray-500 normal-case">({section.note})</span>}
        </td>
        <PeriodCols a={section.total} grossBudget={p1GrossBudget} grossActual={p1GrossActual} py="py-2" />
        {hasPeriod2 && (
          <>
            <PeriodCols a={p2Amounts} grossBudget={p2!.grossBudget} grossActual={p2!.grossActual} py="py-2" />
            <DeltaTd p1={section.total.actual} p2={p2Amounts.actual} revCtx={revCtx} py="py-2" />
          </>
        )}
      </tr>
    )
  }

  function renderCalcRow(calcRow: PLCalcRowData) {
    const p2Amounts = p2?.calcRows[calcRow.id] ?? ZERO
    return (
      <tr key={calcRow.id} className="border-b-2 border-indigo-300 bg-indigo-50">
        <td className="px-3 py-2 text-sm font-bold text-indigo-900 uppercase tracking-wide">
          {calcRow.label}
        </td>
        <PeriodCols a={calcRow} grossBudget={p1GrossBudget} grossActual={p1GrossActual} py="py-2" />
        {hasPeriod2 && (
          <>
            <PeriodCols a={p2Amounts} grossBudget={p2!.grossBudget} grossActual={p2!.grossActual} py="py-2" />
            <DeltaTd p1={calcRow.actual} p2={p2Amounts.actual} revCtx={true} py="py-2" />
          </>
        )}
      </tr>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        {/* Column width hints */}
        <colgroup>
          <col style={{ minWidth: '280px' }} />
          <col style={{ width: '112px' }} />
          <col style={{ width: '64px' }} />
          <col style={{ width: '112px' }} />
          <col style={{ width: '64px' }} />
          {hasPeriod2 && (
            <>
              <col style={{ width: '112px' }} />
              <col style={{ width: '64px' }} />
              <col style={{ width: '112px' }} />
              <col style={{ width: '64px' }} />
              <col style={{ width: '80px' }} />
            </>
          )}
        </colgroup>

        {/* ── Header ── */}
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800 text-white">
            <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider border-b border-slate-600 align-bottom">
              Line Item
            </th>
            <th colSpan={4} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider border-b border-l border-slate-600">
              {period1.label}
            </th>
            {hasPeriod2 && (
              <>
                <th colSpan={4} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider border-b border-l border-slate-600">
                  {period2!.label}
                </th>
                <th rowSpan={2} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider border-b border-l border-slate-600 align-bottom">
                  {deltaLabel}
                </th>
              </>
            )}
          </tr>
          <tr className="bg-slate-700 text-slate-200">
            {(['Budget', '%Rev', 'Actual', '%Rev'] as const).map((h, i) => (
              <th key={`p1-${i}`} className={`px-2 py-1.5 text-right text-xs font-medium whitespace-nowrap ${i === 0 ? 'border-l border-slate-600' : ''}`}>
                {h}
              </th>
            ))}
            {hasPeriod2 && (['Budget', '%Rev', 'Actual', '%Rev'] as const).map((h, i) => (
              <th key={`p2-${i}`} className={`px-2 py-1.5 text-right text-xs font-medium whitespace-nowrap ${i === 0 ? 'border-l border-slate-600' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Body ── */}
        <tbody className="bg-white divide-y divide-gray-100">
          {period1.data.sections.map(section => {
            const showSubtotals  = section.groups.length > 1
            const calcRowsAfter  = showCalculatedRows
              ? period1.data.calculatedRows.filter(r => r.afterSectionId === section.id)
              : []
            // Skip empty sections
            const hasItems = section.groups.some(g => g.lineItems.length > 0)
            if (!hasItems) return null

            return (
              <Fragment key={section.id}>
                {/* Section header */}
                <tr className="bg-slate-700">
                  <td colSpan={totalCols} className="px-3 py-2 text-xs font-bold text-white uppercase tracking-wider">
                    {section.title}
                  </td>
                </tr>

                {section.groups.map(group => {
                  if (group.lineItems.length === 0) return null
                  return (
                    <Fragment key={`${section.id}-${group.deptFullName}`}>
                      {/* Group label (only for multi-group sections) */}
                      {showSubtotals && (
                        <tr className="bg-slate-50">
                          <td colSpan={totalCols} className="px-4 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {group.deptFullName}
                          </td>
                        </tr>
                      )}

                      {/* Line items */}
                      {group.lineItems.map(item => renderLineItem(item, group, section))}

                      {/* Group subtotal (only if 2+ groups) */}
                      {showSubtotals && renderGroupSubtotal(group, section)}
                    </Fragment>
                  )
                })}

                {/* Section total */}
                {renderSectionTotal(section)}

                {/* Calculated rows after this section */}
                {calcRowsAfter.map(renderCalcRow)}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
