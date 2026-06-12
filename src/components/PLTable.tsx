'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import type {
  PLData, PLSectionData, PLGroupData, PLLineItemRow, PLCalcRowData, Amounts,
} from '@/lib/pl-types'
import { ZERO, addAmounts } from '@/lib/pl-types'

// ── Collapse state ────────────────────────────────────────────────────────────

type CollapseState = {
  sections:   Record<string, boolean>
  depts:      Record<string, boolean>
  categories: Record<string, boolean>
}

// ── Formatting ────────────────────────────────────────────────────────────────

function thb(n: number) {
  if (n === 0) return '—'
  return `฿${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

function pctStr(v: number, base: number) {
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
const num      = 'text-right tabular-nums whitespace-nowrap'

// ── P2 lookup map ─────────────────────────────────────────────────────────────

type P2Map = {
  items:         Record<string, Amounts>
  sectionTotals: Record<string, Amounts>
  calcRows:      Record<string, Amounts>
  grossBudget:   number
  grossActual:   number
}

function buildP2Map(data: PLData): P2Map {
  const m: P2Map = { items: {}, sectionTotals: {}, calcRows: {}, grossBudget: 0, grossActual: 0 }
  for (const s of data.sections) {
    m.sectionTotals[s.id] = s.total
    if (s.id === 'revenue_channel') { m.grossBudget = s.total.budget; m.grossActual = s.total.actual }
    for (const g of s.groups)
      for (const li of g.lineItems)
        m.items[li.lineItemId] = { budget: li.budget, actual: li.actual, variance: li.variance }
  }
  for (const r of data.calculatedRows)
    m.calcRows[r.id] = { budget: r.budget, actual: r.actual, variance: r.variance }
  return m
}

// ── Cell primitives ───────────────────────────────────────────────────────────

function AmtCell({ n, py = 'py-1.5' }: { n: number; py?: string }) {
  return (
    <td className={`${num} px-3 ${py} text-xs`}>
      <span className={n === 0 ? 'text-gray-300' : ''}>{thb(n)}</span>
    </td>
  )
}

function PctCell({ v, base, py = 'py-1.5' }: { v: number; base: number; py?: string }) {
  return <td className={`${num} px-2 ${py} text-[10px] text-gray-400`}>{pctStr(v, base)}</td>
}

function DeltaCell({ p1, p2, revCtx, py = 'py-1.5' }: {
  p1: number; p2: number; revCtx: boolean; py?: string
}) {
  const { text, pos } = deltaInfo(p1, p2)
  const cls = pos === null ? 'text-gray-400'
    : (revCtx ? pos : !pos) ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'
  return <td className={`${num} px-3 ${py} text-[10px] ${cls}`}>{text}</td>
}

function PCols({ a, gb, ga, py = 'py-1.5' }: { a: Amounts; gb: number; ga: number; py?: string }) {
  return (
    <>
      <AmtCell n={a.budget} py={py} />
      <PctCell v={a.budget} base={gb} py={py} />
      <AmtCell n={a.actual} py={py} />
      <PctCell v={a.actual} base={ga} py={py} />
    </>
  )
}

function OwnerCell({ value, showDash, py = 'py-1.5' }: {
  value?: string | null; showDash?: boolean; py?: string
}) {
  return (
    <td className={`px-2 ${py} text-[11px] text-gray-400 whitespace-nowrap max-w-[110px] truncate`}>
      {value ?? (showDash ? '—' : '')}
    </td>
  )
}

// ── Inline-editable cell (admin / CEO only) ───────────────────────────────────

function InlineEditCell({
  value, py = 'py-1.5', onSave,
}: {
  value: number
  py?: string
  onSave: (v: number) => Promise<void>
}) {
  const [editing,    setEditing]    = useState(false)
  const [displayVal, setDisplayVal] = useState(value)
  const [flash,      setFlash]      = useState<'success' | 'error' | null>(null)

  useEffect(() => { setDisplayVal(value) }, [value])

  async function commit(raw: string) {
    const v = parseFloat(raw)
    setEditing(false)
    if (isNaN(v) || v === displayVal) return
    console.log('[PLTable] saving inline edit', { raw, parsed: v, prev: displayVal })
    try {
      await onSave(v)
      setDisplayVal(v)
      setFlash('success')
      console.log('[PLTable] save ok')
    } catch (e) {
      console.error('[PLTable] save failed', e)
      setFlash('error')
    }
    setTimeout(() => setFlash(null), 300)
  }

  if (editing) {
    return (
      <td className={`px-1 ${py}`} onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          type="number"
          defaultValue={displayVal}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-24 text-right text-xs tabular-nums border border-indigo-400 rounded px-1 py-0.5 focus:outline-none bg-white"
        />
      </td>
    )
  }

  return (
    <td
      className={`${num} px-3 ${py} text-xs cursor-pointer group relative transition-colors ${
        flash === 'success' ? 'bg-emerald-100' : flash === 'error' ? 'bg-red-100' : ''
      }`}
      onClick={e => { e.stopPropagation(); console.log('[PLTable] cell clicked, entering edit mode'); setEditing(true) }}
    >
      <span className={displayVal === 0 ? 'text-gray-300' : ''}>{thb(displayVal)}</span>
      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 opacity-0 group-hover:opacity-40 pointer-events-none">✏</span>
    </td>
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
  monthDate:  string
  amount:     number
}

export interface PLTableProps {
  period1:             { label: string; data: PLData }
  period2?:            { label: string; data: PLData }
  deltaLabel?:         string
  /** 'admin' or 'ceo' enables inline cell editing via /api/pl/update */
  role?:               string
  onBudgetSave?:       (p: BudgetEditParams) => Promise<void>
  onActualSave?:       (p: ActualEditParams) => Promise<void>
  onRowClick?:         (lineItemId: string, lineItemName: string) => void
  showCalculatedRows?: boolean
  defaultExpanded?:    'all' | string[]
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PLTable({
  period1, period2, deltaLabel = 'Δ%',
  role, onBudgetSave, onActualSave, onRowClick,
  showCalculatedRows = true,
  defaultExpanded,
}: PLTableProps) {

  const [collapse, setCollapse] = useState<CollapseState>(() => {
    if (defaultExpanded === 'all') {
      const sections: Record<string, boolean> = {}
      const depts:    Record<string, boolean> = {}
      for (const s of period1.data.sections) {
        sections[s.id] = true
        for (const g of s.groups) { if (g.departmentId) depts[g.departmentId] = true }
      }
      return { sections, depts, categories: {} }
    }
    if (Array.isArray(defaultExpanded)) {
      const sections: Record<string, boolean> = {}
      for (const id of defaultExpanded) sections[id] = true
      return { sections, depts: {}, categories: {} }
    }
    return { sections: {}, depts: {}, categories: {} }
  })

  const p2         = useMemo(() => period2 ? buildP2Map(period2.data) : null, [period2])
  const hasPeriod2 = p2 !== null
  // Editing always targets period1; period2 comparison columns are read-only context
  const canEdit    = role === 'admin' || role === 'ceo'

  const [p1gb, p1ga] = useMemo(() => {
    const rev = period1.data.sections.find(s => s.id === 'revenue_channel')
    return [rev?.total.budget ?? 0, rev?.total.actual ?? 0]
  }, [period1])

  const { year, month } = period1.data
  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`

  function toggleSection(id: string) {
    setCollapse(prev => ({ ...prev, sections: { ...prev.sections, [id]: !(prev.sections[id] ?? false) } }))
  }
  function toggleDept(deptId: string) {
    setCollapse(prev => ({ ...prev, depts: { ...prev.depts, [deptId]: !(prev.depts[deptId] ?? false) } }))
  }
  function toggleCategory(catKey: string) {
    setCollapse(prev => ({ ...prev, categories: { ...prev.categories, [catKey]: !(prev.categories[catKey] ?? false) } }))
  }

  // ── Inline save helper ─────────────────────────────────────────────────────

  function makeSave(li: PLLineItemRow, deptId: string, field: 'budget' | 'actual') {
    return async (v: number) => {
      const r = await fetch('/api/pl/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_item_id:  li.lineItemId,
          department_id: deptId,
          year, month, field, value: v,
        }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Save failed') }
    }
  }

  // ── Row renderers ──────────────────────────────────────────────────────────

  function renderLineItem(
    li: PLLineItemRow, group: PLGroupData, section: PLSectionData, deepIndent: boolean,
  ) {
    const p2a    = p2?.items[li.lineItemId] ?? ZERO
    const revCtx = REV_IDS.has(section.id)

    return (
      <tr
        key={li.lineItemId}
        onClick={() => onRowClick?.(li.lineItemId, li.name)}
        className={`border-b border-gray-100 ${onRowClick ? 'cursor-pointer hover:bg-indigo-50' : canEdit ? '' : 'hover:bg-gray-50/30'}`}
        style={deepIndent ? { borderLeft: '2px solid #d1d5db' } : undefined}
      >
        <td className={`${deepIndent ? 'pl-[48px]' : 'pl-10'} pr-3 py-1.5 text-xs text-gray-700`}>
          <div>{li.name}</div>
          {li.subcategoryL1 && <div className="text-[10px] text-gray-400 mt-0.5">{li.subcategoryL1}</div>}
        </td>
        <OwnerCell value={li.ownerName} showDash />
        {canEdit ? (
          <>
            <InlineEditCell value={li.budget} onSave={makeSave(li, group.departmentId, 'budget')} />
            <PctCell v={li.budget} base={p1gb} />
            <InlineEditCell value={li.actual} onSave={makeSave(li, group.departmentId, 'actual')} />
            <PctCell v={li.actual} base={p1ga} />
          </>
        ) : (
          <>
            <AmtCell n={li.budget} />
            <PctCell v={li.budget} base={p1gb} />
            <AmtCell n={li.actual} />
            <PctCell v={li.actual} base={p1ga} />
          </>
        )}
        {hasPeriod2 && (
          <>
            <PCols a={p2a} gb={p2!.grossBudget} ga={p2!.grossActual} />
            <DeltaCell p1={li.actual} p2={p2a.actual} revCtx={revCtx} />
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
          {section.note && <span className="ml-2 font-normal text-gray-400 normal-case">({section.note})</span>}
        </td>
        <OwnerCell py="py-2" />
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
        <td className="px-3 py-2.5 text-sm font-bold text-blue-900 uppercase tracking-wide">{cr.label}</td>
        <OwnerCell py="py-2.5" />
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

  function renderStandardGroup(group: PLGroupData, section: PLSectionData) {
    const isExpanded = collapse.depts[group.departmentId] ?? false
    const p2gsub = p2
      ? group.lineItems.reduce((acc: Amounts, li) => addAmounts(acc, p2.items[li.lineItemId] ?? ZERO), ZERO)
      : ZERO
    const revCtx = REV_IDS.has(section.id)
    return (
      <Fragment key={group.departmentId}>
        <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors select-none"
            onClick={() => toggleDept(group.departmentId)}>
          <td className="pl-4 pr-3 py-2 text-[13px] font-medium text-gray-700">
            <span className="mr-2 text-gray-400 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
            {group.deptFullName}
          </td>
          <OwnerCell value={group.ownerName} py="py-2" />
          <PCols a={group.subtotal} gb={p1gb} ga={p1ga} py="py-2" />
          {hasPeriod2 && (
            <>
              <PCols a={p2gsub} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2" />
              <DeltaCell p1={group.subtotal.actual} p2={p2gsub.actual} revCtx={revCtx} py="py-2" />
            </>
          )}
        </tr>
        {isExpanded && group.lineItems.map(li => renderLineItem(li, group, section, false))}
      </Fragment>
    )
  }

  function renderOpexGroup(group: PLGroupData, section: PLSectionData) {
    const isDeptExpanded = collapse.depts[group.departmentId] ?? false
    const p2gsub = p2
      ? group.lineItems.reduce((acc: Amounts, li) => addAmounts(acc, p2.items[li.lineItemId] ?? ZERO), ZERO)
      : ZERO
    const catMap = new Map<string, PLLineItemRow[]>()
    for (const li of group.lineItems) {
      if (!catMap.has(li.categoryName)) catMap.set(li.categoryName, [])
      catMap.get(li.categoryName)!.push(li)
    }
    return (
      <Fragment key={group.departmentId}>
        <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors select-none"
            onClick={() => toggleDept(group.departmentId)}>
          <td className="pl-4 pr-3 py-2 text-[13px] font-medium text-gray-700">
            <span className="mr-2 text-gray-400 text-[10px]">{isDeptExpanded ? '▼' : '▶'}</span>
            {group.deptFullName}
          </td>
          <OwnerCell value={group.ownerName} py="py-2" />
          <PCols a={group.subtotal} gb={p1gb} ga={p1ga} py="py-2" />
          {hasPeriod2 && (
            <>
              <PCols a={p2gsub} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2" />
              <DeltaCell p1={group.subtotal.actual} p2={p2gsub.actual} revCtx={false} py="py-2" />
            </>
          )}
        </tr>
        {isDeptExpanded && Array.from(catMap.entries()).map(([catName, catItems]) => {
          const catKey        = `${group.departmentId}|${catName}`
          const isCatExpanded = collapse.categories[catKey] ?? false
          const catTotal      = catItems.reduce((acc: Amounts, li) => addAmounts(acc, li), ZERO)
          const catP2Total    = p2
            ? catItems.reduce((acc: Amounts, li) => addAmounts(acc, p2.items[li.lineItemId] ?? ZERO), ZERO)
            : ZERO
          return (
            <Fragment key={catKey}>
              <tr className="bg-white cursor-pointer hover:bg-gray-50 transition-colors select-none"
                  style={{ borderLeft: '2px solid #d1d5db' }}
                  onClick={() => toggleCategory(catKey)}>
                <td className="pl-[34px] pr-3 py-1.5 text-xs font-medium text-gray-500">
                  <span className="mr-2 text-gray-400 text-[10px]">{isCatExpanded ? '▼' : '▶'}</span>
                  {catName}
                </td>
                <OwnerCell />
                <PCols a={catTotal} gb={p1gb} ga={p1ga} />
                {hasPeriod2 && (
                  <>
                    <PCols a={catP2Total} gb={p2!.grossBudget} ga={p2!.grossActual} />
                    <DeltaCell p1={catTotal.actual} p2={catP2Total.actual} revCtx={false} />
                  </>
                )}
              </tr>
              {isCatExpanded && catItems.map(li => renderLineItem(li, group, section, true))}
            </Fragment>
          )
        })}
      </Fragment>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <colgroup>
          <col style={{ minWidth: '280px' }} />
          <col style={{ width: '110px' }} />
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

        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-800 text-white">
            <th rowSpan={2} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-b border-slate-600 align-bottom">
              Line Item
            </th>
            <th rowSpan={2} className="px-2 py-2.5 text-left text-[11px] font-medium text-slate-400 border-b border-slate-600 align-bottom uppercase tracking-wider">
              Owner
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

        <tbody className="bg-white">
          {period1.data.sections.map(section => {
            const hasItems      = section.groups.some(g => g.lineItems.length > 0)
            if (!hasItems) return null
            const isSectionOpen = collapse.sections[section.id] ?? false
            const isOpex        = section.id === OPEX_ID
            const nonEmpty      = section.groups.filter(g => g.lineItems.length > 0)
            const calcRows      = showCalculatedRows
              ? period1.data.calculatedRows.filter(r => r.afterSectionId === section.id)
              : []
            const p2sec         = p2?.sectionTotals[section.id] ?? ZERO
            return (
              <Fragment key={section.id}>
                <tr className="bg-[#1e2a3a] text-white cursor-pointer hover:bg-[#263548] transition-colors select-none"
                    onClick={() => toggleSection(section.id)}>
                  <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider">
                    <span className="mr-2 text-slate-400 text-[10px]">{isSectionOpen ? '▼' : '▶'}</span>
                    {section.title}
                  </td>
                  <OwnerCell py="py-2.5" />
                  <PCols a={section.total} gb={p1gb} ga={p1ga} py="py-2.5" />
                  {hasPeriod2 && (
                    <>
                      <PCols a={p2sec} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2.5" />
                      <DeltaCell p1={section.total.actual} p2={p2sec.actual} revCtx={REV_IDS.has(section.id)} py="py-2.5" />
                    </>
                  )}
                </tr>
                {isSectionOpen && (
                  <>
                    {nonEmpty.map(g => isOpex ? renderOpexGroup(g, section) : renderStandardGroup(g, section))}
                    {renderSectionTotal(section)}
                  </>
                )}
                {calcRows.map(renderCalcRow)}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
