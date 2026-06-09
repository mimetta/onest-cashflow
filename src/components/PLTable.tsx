'use client'

import { Fragment, useMemo, useState } from 'react'
import type {
  PLData, PLSectionData, PLGroupData, PLLineItemRow, PLCalcRowData, Amounts,
} from '@/lib/pl-types'
import { ZERO } from '@/lib/pl-types'
import EditableCell from './EditableCell'

// ── Formatting ────────────────────────────────────────────────────────────────

function thb(n: number) {
  if (n === 0) return '—'
  return `฿${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

function pctStr(v: number, base: number): string {
  if (base === 0) return '—'
  return `${(v / base * 100).toFixed(1)}%`
}

function deltaInfo(p1: number, p2: number): { text: string; pos: boolean | null } {
  if (p1 === 0 && p2 === 0) return { text: '—', pos: null }
  if (p2 === 0) return { text: 'n/a', pos: null }
  const d = (p1 - p2) / Math.abs(p2) * 100
  return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, pos: Math.abs(d) < 0.05 ? null : d > 0 }
}

const OPEX_ID = 'operating_expenses'
const REV_IDS = new Set(['revenue_channel', 'revenue_product'])

// ── P2 lookups ────────────────────────────────────────────────────────────────

type P2Map = {
  items:         Record<string, Amounts>
  groupSubs:     Record<string, Amounts>
  sectionTotals: Record<string, Amounts>
  calcRows:      Record<string, Amounts>
  grossBudget:   number
  grossActual:   number
}

function buildP2Map(data: PLData): P2Map {
  const m: P2Map = {
    items: {}, groupSubs: {}, sectionTotals: {}, calcRows: {},
    grossBudget: 0, grossActual: 0,
  }
  for (const s of data.sections) {
    m.sectionTotals[s.id] = s.total
    if (s.id === 'revenue_channel') {
      m.grossBudget = s.total.budget
      m.grossActual = s.total.actual
    }
    for (const g of s.groups) {
      m.groupSubs[`${s.id}|${g.deptFullName}`] = g.subtotal
      for (const li of g.lineItems) {
        m.items[li.lineItemId] = { budget: li.budget, actual: li.actual, variance: li.variance }
      }
    }
  }
  for (const r of data.calculatedRows) {
    m.calcRows[r.id] = { budget: r.budget, actual: r.actual, variance: r.variance }
  }
  return m
}

// ── Cell primitives ───────────────────────────────────────────────────────────

const num = 'text-right tabular-nums whitespace-nowrap'

function AmtCell({
  n, py = 'py-1.5', editable, onSave,
}: {
  n: number; py?: string; editable?: boolean; onSave?: (v: number) => Promise<void>
}) {
  return (
    <td className={`${num} px-3 ${py} text-sm`} onClick={e => editable && e.stopPropagation()}>
      {editable && onSave
        ? <EditableCell value={n} onSave={onSave} />
        : <span className={n === 0 ? 'text-gray-300' : ''}>{thb(n)}</span>}
    </td>
  )
}

function PctCell({ v, base, py = 'py-1.5' }: { v: number; base: number; py?: string }) {
  return (
    <td className={`${num} px-2 ${py} text-xs text-gray-400`}>{pctStr(v, base)}</td>
  )
}

function DeltaCell({ p1, p2, revCtx, py = 'py-1.5' }: {
  p1: number; p2: number; revCtx: boolean; py?: string
}) {
  const { text, pos } = deltaInfo(p1, p2)
  const cls = pos === null ? 'text-gray-400'
    : (revCtx ? pos : !pos) ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'
  return <td className={`${num} px-3 ${py} text-xs ${cls}`}>{text}</td>
}

function PCols({
  a, gb, ga, py = 'py-1.5', editable, onB, onA,
}: {
  a: Amounts; gb: number; ga: number; py?: string
  editable?: boolean
  onB?: (v: number) => Promise<void>
  onA?: (v: number) => Promise<void>
}) {
  return (
    <>
      <AmtCell n={a.budget} py={py} editable={editable} onSave={onB} />
      <PctCell v={a.budget} base={gb} py={py} />
      <AmtCell n={a.actual} py={py} editable={editable} onSave={onA} />
      <PctCell v={a.actual} base={ga} py={py} />
    </>
  )
}

// ── Export types ──────────────────────────────────────────────────────────────

export interface BudgetEditParams {
  lineItemId:   string
  departmentId: string
  year:         number
  month:        number
  amount:       number
}

export interface ActualEditParams {
  lineItemId: string
  monthDate:  string   // 'YYYY-MM-01'
  amount:     number
}

export interface PLTableProps {
  period1:              { label: string; data: PLData }
  period2?:             { label: string; data: PLData }
  deltaLabel?:          string
  onBudgetSave?:        (p: BudgetEditParams) => Promise<void>
  onActualSave?:        (p: ActualEditParams) => Promise<void>
  onRowClick?:          (lineItemId: string, lineItemName: string) => void
  showCalculatedRows?:  boolean
  /** Pre-expand sections on mount: 'all' expands everything, or pass section id array */
  defaultExpanded?:     'all' | string[]
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PLTable({
  period1, period2, deltaLabel = 'Δ%',
  onBudgetSave, onActualSave, onRowClick,
  showCalculatedRows = true,
  defaultExpanded,
}: PLTableProps) {
  // -- Initial expand state (runs once on mount)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    if (defaultExpanded === 'all') return new Set(period1.data.sections.map(s => s.id))
    if (Array.isArray(defaultExpanded)) return new Set(defaultExpanded)
    return new Set<string>()
  })

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    if (defaultExpanded === 'all') {
      const opex = period1.data.sections.find(s => s.id === OPEX_ID)
      return new Set(
        opex?.groups
          .filter(g => g.lineItems.length > 0)
          .map(g => `${OPEX_ID}|${g.deptFullName}`) ?? []
      )
    }
    return new Set<string>()
  })

  const p2 = useMemo(() => period2 ? buildP2Map(period2.data) : null, [period2])

  const hasPeriod2 = p2 !== null
  const totalCols  = hasPeriod2 ? 10 : 5
  const editable   = Boolean(onBudgetSave || onActualSave) && !hasPeriod2

  const [p1gb, p1ga] = useMemo(() => {
    const rev = period1.data.sections.find(s => s.id === 'revenue_channel')
    return [rev?.total.budget ?? 0, rev?.total.actual ?? 0]
  }, [period1])

  const { year, month } = period1.data
  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`

  function toggleSection(id: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // -- Row renderers

  function renderLineItem(li: PLLineItemRow, group: PLGroupData, section: PLSectionData) {
    const p2a    = p2?.items[li.lineItemId] ?? ZERO
    const revCtx = REV_IDS.has(section.id)
    return (
      <tr
        key={li.lineItemId}
        onClick={() => onRowClick?.(li.lineItemId, li.name)}
        className={`border-b border-gray-100 ${
          onRowClick ? 'cursor-pointer hover:bg-indigo-50' : 'hover:bg-gray-50/50'
        }`}
      >
        <td className="pl-10 pr-3 py-1.5 text-sm text-gray-700">
          <div>{li.name}</div>
          {li.subcategoryL1 && <div className="text-xs text-gray-400 mt-0.5">{li.subcategoryL1}</div>}
        </td>
        <PCols
          a={li} gb={p1gb} ga={p1ga}
          editable={editable}
          onB={onBudgetSave
            ? v => onBudgetSave({ lineItemId: li.lineItemId, departmentId: group.departmentId, year, month, amount: v })
            : undefined}
          onA={onActualSave
            ? v => onActualSave({ lineItemId: li.lineItemId, monthDate, amount: v })
            : undefined}
        />
        {hasPeriod2 && (
          <>
            <PCols a={p2a} gb={p2!.grossBudget} ga={p2!.grossActual} />
            <DeltaCell p1={li.actual} p2={p2a.actual} revCtx={revCtx} />
          </>
        )}
      </tr>
    )
  }

  function renderGroupSubtotal(group: PLGroupData, section: PLSectionData) {
    const p2a    = p2?.groupSubs[`${section.id}|${group.deptFullName}`] ?? ZERO
    const revCtx = REV_IDS.has(section.id)
    return (
      <tr className="border-b border-gray-200 bg-gray-50">
        <td className="pl-6 pr-3 py-1.5 text-xs font-semibold italic text-gray-500">
          {group.subtotalLabel}
        </td>
        <PCols a={group.subtotal} gb={p1gb} ga={p1ga} />
        {hasPeriod2 && (
          <>
            <PCols a={p2a} gb={p2!.grossBudget} ga={p2!.grossActual} />
            <DeltaCell p1={group.subtotal.actual} p2={p2a.actual} revCtx={revCtx} />
          </>
        )}
      </tr>
    )
  }

  function renderSectionTotal(section: PLSectionData) {
    const p2a    = p2?.sectionTotals[section.id] ?? ZERO
    const revCtx = REV_IDS.has(section.id)
    return (
      <tr className="border-b-2 border-gray-300 bg-gray-200">
        <td className="px-3 py-2 text-xs font-bold text-gray-800 uppercase tracking-wide">
          {section.totalLabel}
          {section.note && (
            <span className="ml-2 font-normal text-gray-400 normal-case">({section.note})</span>
          )}
        </td>
        <PCols a={section.total} gb={p1gb} ga={p1ga} py="py-2" />
        {hasPeriod2 && (
          <>
            <PCols a={p2a} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2" />
            <DeltaCell p1={section.total.actual} p2={p2a.actual} revCtx={revCtx} py="py-2" />
          </>
        )}
      </tr>
    )
  }

  function renderCalcRow(cr: PLCalcRowData) {
    const p2a = p2?.calcRows[cr.id] ?? ZERO
    return (
      <tr key={cr.id} className="border-b-2 border-blue-200 bg-blue-50">
        <td className="px-3 py-2.5 text-sm font-bold text-blue-900 uppercase tracking-wide">
          {cr.label}
        </td>
        <PCols a={cr} gb={p1gb} ga={p1ga} py="py-2.5" />
        {hasPeriod2 && (
          <>
            <PCols a={p2a} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2.5" />
            <DeltaCell p1={cr.actual} p2={p2a.actual} revCtx={true} py="py-2.5" />
          </>
        )}
      </tr>
    )
  }

  // -- Main render

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <colgroup>
          <col style={{ minWidth: '280px' }} />
          <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
          <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
          {hasPeriod2 && (
            <>
              <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
              <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
              <col style={{ width: '78px' }} />
            </>
          )}
        </colgroup>

        {/* Header */}
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800 text-white">
            <th rowSpan={2} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-b border-slate-600 align-bottom">
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
          <tr className="bg-slate-700 text-slate-200 text-xs">
            {(['Budget', '%Rev', 'Actual', '%Rev'] as const).map((h, i) => (
              <th key={`p1h${i}`} className={`px-2 py-1.5 text-right font-medium whitespace-nowrap ${i === 0 ? 'border-l border-slate-600' : ''}`}>
                {h}
              </th>
            ))}
            {hasPeriod2 && (['Budget', '%Rev', 'Actual', '%Rev'] as const).map((h, i) => (
              <th key={`p2h${i}`} className={`px-2 py-1.5 text-right font-medium whitespace-nowrap ${i === 0 ? 'border-l border-slate-600' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="bg-white divide-y divide-gray-100">
          {period1.data.sections.map(section => {
            const hasItems    = section.groups.some(g => g.lineItems.length > 0)
            if (!hasItems) return null

            const isExpanded  = expandedSections.has(section.id)
            const isOpex      = section.id === OPEX_ID
            const nonEmpty    = section.groups.filter(g => g.lineItems.length > 0)
            const multiGroup  = nonEmpty.length > 1
            const calcRows    = showCalculatedRows
              ? period1.data.calculatedRows.filter(r => r.afterSectionId === section.id)
              : []

            const p2sec = p2?.sectionTotals[section.id] ?? ZERO

            return (
              <Fragment key={section.id}>
                {/* ── Section header — always visible, always shows totals ── */}
                <tr
                  className="bg-[#1e2a3a] text-white cursor-pointer hover:bg-[#263548] transition-colors select-none"
                  onClick={() => toggleSection(section.id)}
                >
                  <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider">
                    <span className="mr-2 text-slate-400 text-[10px]">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    {section.title}
                  </td>
                  <PCols a={section.total} gb={p1gb} ga={p1ga} py="py-2.5" />
                  {hasPeriod2 && (
                    <>
                      <PCols a={p2sec} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2.5" />
                      <DeltaCell p1={section.total.actual} p2={p2sec.actual} revCtx={REV_IDS.has(section.id)} py="py-2.5" />
                    </>
                  )}
                </tr>

                {/* ── Expanded content ── */}
                {isExpanded && (
                  isOpex ? (
                    // OPEX: each dept group is independently collapsible
                    <>
                      {nonEmpty.map(group => {
                        const groupKey      = `${OPEX_ID}|${group.deptFullName}`
                        const isGrpExpanded = expandedGroups.has(groupKey)
                        const p2gsub        = p2?.groupSubs[`${section.id}|${group.deptFullName}`] ?? ZERO
                        return (
                          <Fragment key={groupKey}>
                            {/* Group header */}
                            <tr
                              className="bg-gray-200 cursor-pointer hover:bg-gray-300 transition-colors select-none"
                              onClick={() => toggleGroup(groupKey)}
                            >
                              <td className="pl-5 pr-3 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                <span className="mr-2 text-gray-400 text-[10px]">
                                  {isGrpExpanded ? '▼' : '▶'}
                                </span>
                                {group.deptFullName}
                              </td>
                              <PCols a={group.subtotal} gb={p1gb} ga={p1ga} py="py-2" />
                              {hasPeriod2 && (
                                <>
                                  <PCols a={p2gsub} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2" />
                                  <DeltaCell p1={group.subtotal.actual} p2={p2gsub.actual} revCtx={false} py="py-2" />
                                </>
                              )}
                            </tr>
                            {/* Group line items */}
                            {isGrpExpanded && group.lineItems.map(li => renderLineItem(li, group, section))}
                          </Fragment>
                        )
                      })}
                      {renderSectionTotal(section)}
                    </>
                  ) : (
                    // Non-OPEX: all groups expand together
                    <>
                      {nonEmpty.map(group => (
                        <Fragment key={`${section.id}-${group.deptFullName}`}>
                          {/* Non-clickable group label (only for multi-group sections) */}
                          {multiGroup && (
                            <tr className="bg-slate-50">
                              <td
                                colSpan={totalCols}
                                className="px-5 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                              >
                                {group.deptFullName}
                              </td>
                            </tr>
                          )}
                          {group.lineItems.map(li => renderLineItem(li, group, section))}
                          {/* Group subtotal for multi-group sections */}
                          {multiGroup && renderGroupSubtotal(group, section)}
                        </Fragment>
                      ))}
                      {renderSectionTotal(section)}
                    </>
                  )
                )}

                {/* ── Calculated rows after this section — always visible ── */}
                {calcRows.map(renderCalcRow)}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
