'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import type {
  PLData, PLSectionData, PLGroupData, PLLineItemRow, PLCalcRowData, Amounts, MonthColumn,
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

// ── P2 lookup map (comparison mode) ──────────────────────────────────────────

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

// ── Month lookup map (multi-month mode) ───────────────────────────────────────

type MonthLookup = {
  lineItems:   Map<string, Amounts>
  groups:      Map<string, Amounts>
  sections:    Map<string, Amounts>
  calcRows:    Map<string, Amounts>
  grossBudget: number
  grossActual: number
}

function buildMonthLookup(data: PLData): MonthLookup {
  const lineItems = new Map<string, Amounts>()
  const groups    = new Map<string, Amounts>()
  const sections  = new Map<string, Amounts>()
  const calcRows  = new Map<string, Amounts>()
  let grossBudget = 0, grossActual = 0
  for (const s of data.sections) {
    sections.set(s.id, { budget: s.total.budget, actual: s.total.actual, variance: s.total.variance })
    if (s.id === 'revenue_channel') { grossBudget = s.total.budget; grossActual = s.total.actual }
    for (const g of s.groups) {
      groups.set(g.departmentId, { budget: g.subtotal.budget, actual: g.subtotal.actual, variance: g.subtotal.variance })
      for (const li of g.lineItems)
        lineItems.set(li.lineItemId, { budget: li.budget, actual: li.actual, variance: li.variance })
    }
  }
  for (const r of data.calculatedRows)
    calcRows.set(r.id, { budget: r.budget, actual: r.actual, variance: r.variance })
  return { lineItems, groups, sections, calcRows, grossBudget, grossActual }
}

// ── Cell primitives ───────────────────────────────────────────────────────────

function AmtCell({ n, py = 'py-1.5' }: { n: number; py?: string }) {
  return (
    <td className={`${num} px-3 ${py} text-xs`}>
      <span className={n === 0 ? 'text-gray-300' : ''}>{thb(n)}</span>
    </td>
  )
}

function PctCell({ v, base, py = 'py-1.5', onClick }: {
  v: number; base: number; py?: string; onClick?: () => void
}) {
  return (
    <td
      className={`${num} px-2 ${py} text-[10px] ${
        onClick
          ? 'cursor-pointer text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/50'
          : 'text-gray-400'
      }`}
      onClick={onClick}
      title={onClick ? 'View history' : undefined}
    >
      {pctStr(v, base)}
    </td>
  )
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

// ── Inline-editable cell ──────────────────────────────────────────────────────

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
  months?:             MonthColumn[]
  period1?:            { label: string; data: PLData }
  period2?:            { label: string; data: PLData }
  deltaLabel?:         string
  role?:               string
  onRowClick?:         (lineItemId: string, lineItemName: string) => void
  showCalculatedRows?: boolean
  defaultExpanded?:    'all' | string[]
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PLTable({
  months, period1, period2, deltaLabel = 'Δ%',
  role, onRowClick,
  showCalculatedRows = true,
  defaultExpanded,
}: PLTableProps) {

  const isMultiMonth = !!(months && months.length > 0)
  const refData      = isMultiMonth
    ? months![months!.length - 1].data
    : (period1?.data ?? null)

  const [collapse, setCollapse] = useState<CollapseState>(() => {
    const refSections = refData?.sections ?? []
    if (defaultExpanded === 'all') {
      const sections: Record<string, boolean> = {}
      const depts:    Record<string, boolean> = {}
      for (const s of refSections) {
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

  const p2         = useMemo(() => !isMultiMonth && period2 ? buildP2Map(period2.data) : null, [isMultiMonth, period2])
  const hasPeriod2 = p2 !== null
  const canEdit    = role === 'admin' || role === 'ceo'

  const [p1gb, p1ga] = useMemo(() => {
    if (isMultiMonth) return [0, 0]
    const rev = period1?.data.sections.find(s => s.id === 'revenue_channel')
    return [rev?.total.budget ?? 0, rev?.total.actual ?? 0]
  }, [isMultiMonth, period1])

  const p1Year  = period1?.data.year  ?? 0
  const p1Month = period1?.data.month ?? 0

  const monthLookups = useMemo<MonthLookup[] | null>(() => {
    if (!isMultiMonth || !months) return null
    return months.map(mc => buildMonthLookup(mc.data))
  }, [isMultiMonth, months])

  const mmN    = months?.length ?? 0
  const mmLast = Math.max(0, mmN - 1)
  const mmPrev = Math.max(0, mmN - 2)

  // UUID of the COGS own-make department — used for inventory movement calculation in COGM schedule
  const cogsDeptId = useMemo(() => {
    return refData?.sections
      .find(s => s.id === 'cost_of_goods')
      ?.groups.find(g => g.deptCode === 'COGS')
      ?.departmentId ?? ''
  }, [refData])

  function toggleSection(id: string) {
    setCollapse(prev => ({ ...prev, sections: { ...prev.sections, [id]: !(prev.sections[id] ?? false) } }))
  }
  function toggleDept(id: string) {
    setCollapse(prev => ({ ...prev, depts: { ...prev.depts, [id]: !(prev.depts[id] ?? false) } }))
  }
  function toggleCategory(key: string) {
    setCollapse(prev => ({ ...prev, categories: { ...prev.categories, [key]: !(prev.categories[key] ?? false) } }))
  }

  // FIX 2: each cell knows its own month context
  function makeSave(li: PLLineItemRow, field: 'budget' | 'actual', colYear: number, colMonth: number) {
    return async (v: number) => {
      console.log('[PLTable] saving inline edit', { lineItemId: li.lineItemId, field, colYear, colMonth, v })
      const r = await fetch('/api/pl/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_item_id: li.lineItemId, year: colYear, month: colMonth, field, value: v }),
      })
      if (!r.ok) {
        const d = await r.json()
        console.error('[PLTable] save failed', d)
        throw new Error(d.error ?? 'Save failed')
      }
      console.log('[PLTable] save ok')
    }
  }

  // ── Comparison-mode renderers ──────────────────────────────────────────────

  // FIX 1: no row-level onClick; %Rev cells open history drawer
  function renderLineItemCmp(
    li: PLLineItemRow, group: PLGroupData, section: PLSectionData, deepIndent: boolean,
  ) {
    const p2a      = p2?.items[li.lineItemId] ?? ZERO
    const revCtx   = REV_IDS.has(section.id)
    const histClick = onRowClick ? () => onRowClick!(li.lineItemId, li.name) : undefined
    return (
      <tr
        key={li.lineItemId}
        className="border-b border-gray-100 hover:bg-gray-50/30"
        style={deepIndent ? { borderLeft: '2px solid #d1d5db' } : undefined}
      >
        <td className={`${deepIndent ? 'pl-[48px]' : 'pl-10'} pr-3 py-1.5 text-xs text-gray-700`}>
          <div>{li.name}</div>
          {li.subcategoryL1 && <div className="text-[10px] text-gray-400 mt-0.5">{li.subcategoryL1}</div>}
        </td>
        <OwnerCell value={li.ownerName} showDash />
        {canEdit ? (
          <>
            <InlineEditCell value={li.budget} onSave={makeSave(li, 'budget', p1Year, p1Month)} />
            <PctCell v={li.budget} base={p1gb} onClick={histClick} />
            <InlineEditCell value={li.actual} onSave={makeSave(li, 'actual', p1Year, p1Month)} />
            <PctCell v={li.actual} base={p1ga} onClick={histClick} />
          </>
        ) : (
          <>
            <AmtCell n={li.budget} />
            <PctCell v={li.budget} base={p1gb} onClick={histClick} />
            <AmtCell n={li.actual} />
            <PctCell v={li.actual} base={p1ga} onClick={histClick} />
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

  function renderSectionTotalCmp(section: PLSectionData) {
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

  function renderCalcRowCmp(cr: PLCalcRowData) {
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

  function renderStdGroupCmp(group: PLGroupData, section: PLSectionData) {
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
        {isExpanded && group.lineItems.map(li => renderLineItemCmp(li, group, section, false))}
      </Fragment>
    )
  }

  // FIX 4: Factory Operation renders flat (no category sub-headers)
  function renderOpexGroupCmp(group: PLGroupData, section: PLSectionData) {
    const isDeptExpanded = collapse.depts[group.departmentId] ?? false
    const isFactoryOp    = group.deptCode === 'Factory Operation'
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
        {isDeptExpanded && (
          isFactoryOp
            ? group.lineItems.map(li => renderLineItemCmp(li, group, section, false))
            : Array.from(catMap.entries()).map(([catName, catItems]) => {
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
                    {isCatExpanded && catItems.map(li => renderLineItemCmp(li, group, section, true))}
                  </Fragment>
                )
              })
        )}
      </Fragment>
    )
  }

  // ── Multi-month renderers ─────────────────────────────────────────────────

  // FIX 1 + FIX 2 + FIX 5: multi-month line item row
  function renderLineItemMM(
    li: PLLineItemRow, group: PLGroupData, section: PLSectionData, deepIndent: boolean,
  ) {
    const histClick = onRowClick ? () => onRowClick!(li.lineItemId, li.name) : undefined
    const revCtx    = REV_IDS.has(section.id)
    const lastA     = monthLookups![mmLast].lineItems.get(li.lineItemId) ?? ZERO
    const prevA     = monthLookups![mmPrev].lineItems.get(li.lineItemId) ?? ZERO
    return (
      <tr
        key={li.lineItemId}
        className="border-b border-gray-100 hover:bg-gray-50/30"
        style={deepIndent ? { borderLeft: '2px solid #d1d5db' } : undefined}
      >
        <td className={`${deepIndent ? 'pl-[48px]' : 'pl-10'} pr-3 py-1.5 text-xs text-gray-700`}>
          <div>{li.name}</div>
          {li.subcategoryL1 && <div className="text-[10px] text-gray-400 mt-0.5">{li.subcategoryL1}</div>}
        </td>
        <OwnerCell value={li.ownerName} showDash />
        {months!.map((mc, ci) => {
          const a  = monthLookups![ci].lineItems.get(li.lineItemId) ?? ZERO
          const gb = monthLookups![ci].grossBudget
          const ga = monthLookups![ci].grossActual
          return (
            <Fragment key={`${mc.year}-${mc.month}`}>
              {canEdit ? (
                <InlineEditCell value={a.budget} onSave={makeSave(li, 'budget', mc.year, mc.month)} />
              ) : (
                <AmtCell n={a.budget} />
              )}
              <PctCell v={a.budget} base={gb} onClick={histClick} />
              {canEdit ? (
                <InlineEditCell value={a.actual} onSave={makeSave(li, 'actual', mc.year, mc.month)} />
              ) : (
                <AmtCell n={a.actual} />
              )}
              <PctCell v={a.actual} base={ga} onClick={histClick} />
            </Fragment>
          )
        })}
        {mmN >= 2 && <DeltaCell p1={lastA.actual} p2={prevA.actual} revCtx={revCtx} />}
      </tr>
    )
  }

  function renderSectionTotalMM(section: PLSectionData) {
    const revCtx = REV_IDS.has(section.id)
    const lastSt = monthLookups![mmLast].sections.get(section.id) ?? ZERO
    const prevSt = monthLookups![mmPrev].sections.get(section.id) ?? ZERO
    return (
      <tr className="border-b-2 border-gray-300 bg-gray-200">
        <td className="px-3 py-2 text-xs font-bold text-gray-800 uppercase tracking-wide">
          {section.totalLabel}
          {section.note && <span className="ml-2 font-normal text-gray-400 normal-case">({section.note})</span>}
        </td>
        <OwnerCell py="py-2" />
        {months!.map((mc, ci) => {
          const st = monthLookups![ci].sections.get(section.id) ?? ZERO
          const gb = monthLookups![ci].grossBudget
          const ga = monthLookups![ci].grossActual
          return (
            <Fragment key={`${mc.year}-${mc.month}`}>
              <AmtCell n={st.budget} py="py-2" />
              <PctCell v={st.budget} base={gb} py="py-2" />
              <AmtCell n={st.actual} py="py-2" />
              <PctCell v={st.actual} base={ga} py="py-2" />
            </Fragment>
          )
        })}
        {mmN >= 2 && <DeltaCell p1={lastSt.actual} p2={prevSt.actual} revCtx={revCtx} py="py-2" />}
      </tr>
    )
  }

  function renderCalcRowMM(cr: PLCalcRowData) {
    const lastA = monthLookups![mmLast].calcRows.get(cr.id) ?? ZERO
    const prevA = monthLookups![mmPrev].calcRows.get(cr.id) ?? ZERO
    return (
      <tr key={cr.id} className="border-b-2 border-blue-200 bg-blue-50">
        <td className="px-3 py-2.5 text-sm font-bold text-blue-900 uppercase tracking-wide">{cr.label}</td>
        <OwnerCell py="py-2.5" />
        {months!.map((mc, ci) => {
          const a  = monthLookups![ci].calcRows.get(cr.id) ?? ZERO
          const gb = monthLookups![ci].grossBudget
          const ga = monthLookups![ci].grossActual
          return (
            <Fragment key={`${mc.year}-${mc.month}`}>
              <AmtCell n={a.budget} py="py-2.5" />
              <PctCell v={a.budget} base={gb} py="py-2.5" />
              <AmtCell n={a.actual} py="py-2.5" />
              <PctCell v={a.actual} base={ga} py="py-2.5" />
            </Fragment>
          )
        })}
        {mmN >= 2 && <DeltaCell p1={lastA.actual} p2={prevA.actual} revCtx={true} py="py-2.5" />}
      </tr>
    )
  }

  function renderStdGroupMM(group: PLGroupData, section: PLSectionData) {
    const isExpanded = collapse.depts[group.departmentId] ?? false
    const revCtx     = REV_IDS.has(section.id)
    const lastG      = monthLookups![mmLast].groups.get(group.departmentId) ?? ZERO
    const prevG      = monthLookups![mmPrev].groups.get(group.departmentId) ?? ZERO
    return (
      <Fragment key={group.departmentId}>
        <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors select-none"
            onClick={() => toggleDept(group.departmentId)}>
          <td className="pl-4 pr-3 py-2 text-[13px] font-medium text-gray-700">
            <span className="mr-2 text-gray-400 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
            {group.deptFullName}
          </td>
          <OwnerCell value={group.ownerName} py="py-2" />
          {months!.map((mc, ci) => {
            const g  = monthLookups![ci].groups.get(group.departmentId) ?? ZERO
            const gb = monthLookups![ci].grossBudget
            const ga = monthLookups![ci].grossActual
            return (
              <Fragment key={`${mc.year}-${mc.month}`}>
                <AmtCell n={g.budget} py="py-2" />
                <PctCell v={g.budget} base={gb} py="py-2" />
                <AmtCell n={g.actual} py="py-2" />
                <PctCell v={g.actual} base={ga} py="py-2" />
              </Fragment>
            )
          })}
          {mmN >= 2 && <DeltaCell p1={lastG.actual} p2={prevG.actual} revCtx={revCtx} py="py-2" />}
        </tr>
        {isExpanded && group.lineItems.map(li => renderLineItemMM(li, group, section, false))}
      </Fragment>
    )
  }

  // FIX 4 applied to multi-month mode: Factory Operation flat
  function renderOpexGroupMM(group: PLGroupData, section: PLSectionData) {
    const isDeptExpanded = collapse.depts[group.departmentId] ?? false
    const isFactoryOp    = group.deptCode === 'Factory Operation'
    const lastG          = monthLookups![mmLast].groups.get(group.departmentId) ?? ZERO
    const prevG          = monthLookups![mmPrev].groups.get(group.departmentId) ?? ZERO
    const catMap         = new Map<string, PLLineItemRow[]>()
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
          {months!.map((mc, ci) => {
            const g  = monthLookups![ci].groups.get(group.departmentId) ?? ZERO
            const gb = monthLookups![ci].grossBudget
            const ga = monthLookups![ci].grossActual
            return (
              <Fragment key={`${mc.year}-${mc.month}`}>
                <AmtCell n={g.budget} py="py-2" />
                <PctCell v={g.budget} base={gb} py="py-2" />
                <AmtCell n={g.actual} py="py-2" />
                <PctCell v={g.actual} base={ga} py="py-2" />
              </Fragment>
            )
          })}
          {mmN >= 2 && <DeltaCell p1={lastG.actual} p2={prevG.actual} revCtx={false} py="py-2" />}
        </tr>
        {isDeptExpanded && (
          isFactoryOp
            ? group.lineItems.map(li => renderLineItemMM(li, group, section, false))
            : Array.from(catMap.entries()).map(([catName, catItems]) => {
                const catKey        = `${group.departmentId}|${catName}`
                const isCatExpanded = collapse.categories[catKey] ?? false
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
                      {months!.map((mc, ci) => {
                        const catTotal = catItems.reduce((acc, li) => {
                          const a = monthLookups![ci].lineItems.get(li.lineItemId) ?? ZERO
                          return { budget: acc.budget + a.budget, actual: acc.actual + a.actual, variance: acc.variance + a.variance }
                        }, ZERO)
                        const gb = monthLookups![ci].grossBudget
                        const ga = monthLookups![ci].grossActual
                        return (
                          <Fragment key={`${mc.year}-${mc.month}`}>
                            <AmtCell n={catTotal.budget} />
                            <PctCell v={catTotal.budget} base={gb} />
                            <AmtCell n={catTotal.actual} />
                            <PctCell v={catTotal.actual} base={ga} />
                          </Fragment>
                        )
                      })}
                      {mmN >= 2 && (() => {
                        const last = catItems.reduce((acc, li) => {
                          const a = monthLookups![mmLast].lineItems.get(li.lineItemId) ?? ZERO
                          return { budget: acc.budget + a.budget, actual: acc.actual + a.actual, variance: acc.variance + a.variance }
                        }, ZERO)
                        const prev = catItems.reduce((acc, li) => {
                          const a = monthLookups![mmPrev].lineItems.get(li.lineItemId) ?? ZERO
                          return { budget: acc.budget + a.budget, actual: acc.actual + a.actual, variance: acc.variance + a.variance }
                        }, ZERO)
                        return <DeltaCell p1={last.actual} p2={prev.actual} revCtx={false} />
                      })()}
                    </tr>
                    {isCatExpanded && catItems.map(li => renderLineItemMM(li, group, section, true))}
                  </Fragment>
                )
              })
        )}
      </Fragment>
    )
  }

  // ── Section 4: COGS flat row (single item, no expand arrow) ─────────────────

  function renderCogsFlatRowCmp(group: PLGroupData, _section: PLSectionData) {
    const li = group.lineItems[0]
    if (!li) return null
    const p2a = p2?.items[li.lineItemId] ?? ZERO
    return (
      <tr key={group.departmentId} className="bg-gray-100 border-b border-gray-200">
        <td className="pl-4 pr-3 py-2 text-[13px] font-medium text-gray-700">
          {group.deptFullName}
        </td>
        <OwnerCell value={group.ownerName} py="py-2" />
        {canEdit ? (
          <>
            <InlineEditCell value={li.budget} py="py-2" onSave={makeSave(li, 'budget', p1Year, p1Month)} />
            <PctCell v={li.budget} base={p1gb} py="py-2" />
            <InlineEditCell value={li.actual} py="py-2" onSave={makeSave(li, 'actual', p1Year, p1Month)} />
            <PctCell v={li.actual} base={p1ga} py="py-2" />
          </>
        ) : (
          <PCols a={group.subtotal} gb={p1gb} ga={p1ga} py="py-2" />
        )}
        {hasPeriod2 && (
          <>
            <PCols a={p2a} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2" />
            <DeltaCell p1={li.actual} p2={p2a.actual} revCtx={false} py="py-2" />
          </>
        )}
      </tr>
    )
  }

  function renderCogsFlatRowMM(group: PLGroupData, _section: PLSectionData) {
    const li = group.lineItems[0]
    if (!li) return null
    const lastLI = monthLookups![mmLast].lineItems.get(li.lineItemId) ?? ZERO
    const prevLI = monthLookups![mmPrev].lineItems.get(li.lineItemId) ?? ZERO
    return (
      <tr key={group.departmentId} className="bg-gray-100 border-b border-gray-200">
        <td className="pl-4 pr-3 py-2 text-[13px] font-medium text-gray-700">
          {group.deptFullName}
        </td>
        <OwnerCell value={group.ownerName} py="py-2" />
        {months!.map((mc, ci) => {
          const a  = monthLookups![ci].lineItems.get(li.lineItemId) ?? ZERO
          const gb = monthLookups![ci].grossBudget
          const ga = monthLookups![ci].grossActual
          return (
            <Fragment key={`${mc.year}-${mc.month}`}>
              {canEdit ? (
                <InlineEditCell value={a.budget} py="py-2" onSave={makeSave(li, 'budget', mc.year, mc.month)} />
              ) : (
                <AmtCell n={a.budget} py="py-2" />
              )}
              <PctCell v={a.budget} base={gb} py="py-2" />
              {canEdit ? (
                <InlineEditCell value={a.actual} py="py-2" onSave={makeSave(li, 'actual', mc.year, mc.month)} />
              ) : (
                <AmtCell n={a.actual} py="py-2" />
              )}
              <PctCell v={a.actual} base={ga} py="py-2" />
            </Fragment>
          )
        })}
        {mmN >= 2 && <DeltaCell p1={lastLI.actual} p2={prevLI.actual} revCtx={false} py="py-2" />}
      </tr>
    )
  }

  // ── Section 4b: COGM Supporting Schedule (amber, reference only) ─────────────

  function renderCogmSchedule(section: PLSectionData) {
    const COGM_BG      = '#fdf8ee'
    const COGM_TEXT    = '#7a5c10'
    const COGM_BORDER  = '#e8c96a'
    const COGM_ITEM_BG = '#fffdf5'

    const isSectionOpen = collapse.sections[section.id] ?? false
    const group = section.groups[0]
    if (!group) return null

    const cogsGroup = refData!.sections
      .find(s => s.id === 'cost_of_goods')
      ?.groups.find(g => g.departmentId === cogsDeptId)

    return (
      <Fragment key={section.id}>
        <tr style={{ borderTop: `2px dashed ${COGM_BORDER}`, backgroundColor: COGM_BG }}
            className="cursor-pointer select-none"
            onClick={() => toggleSection(section.id)}>
          <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ color: COGM_TEXT }}>
            <span className="mr-2 text-[10px]" style={{ color: COGM_TEXT }}>
              {isSectionOpen ? '▼' : '▶'}
            </span>
            {section.title}
            <span className="ml-3 px-1.5 py-0.5 rounded text-[9px] font-medium border inline-block"
                  style={{ background: '#fff8e1', color: COGM_TEXT, borderColor: COGM_BORDER }}>
              reference only · not in P&L calc
            </span>
          </td>
          <OwnerCell py="py-2.5" />
          {isMultiMonth ? (
            <>
              {months!.map((mc, ci) => {
                const st = monthLookups![ci].sections.get(section.id) ?? ZERO
                const gb = monthLookups![ci].grossBudget
                const ga = monthLookups![ci].grossActual
                return (
                  <Fragment key={`${mc.year}-${mc.month}`}>
                    <AmtCell n={st.budget} py="py-2.5" />
                    <PctCell v={st.budget} base={gb} py="py-2.5" />
                    <AmtCell n={st.actual} py="py-2.5" />
                    <PctCell v={st.actual} base={ga} py="py-2.5" />
                  </Fragment>
                )
              })}
              {mmN >= 2 && (() => {
                const lastSt = monthLookups![mmLast].sections.get(section.id) ?? ZERO
                const prevSt = monthLookups![mmPrev].sections.get(section.id) ?? ZERO
                return <DeltaCell p1={lastSt.actual} p2={prevSt.actual} revCtx={false} py="py-2.5" />
              })()}
            </>
          ) : (
            <>
              <PCols a={section.total} gb={p1gb} ga={p1ga} py="py-2.5" />
              {hasPeriod2 && (
                <>
                  <PCols a={p2?.sectionTotals[section.id] ?? ZERO} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2.5" />
                  <DeltaCell p1={section.total.actual} p2={(p2?.sectionTotals[section.id] ?? ZERO).actual} revCtx={false} py="py-2.5" />
                </>
              )}
            </>
          )}
        </tr>

        {isSectionOpen && (
          <>
            {group.lineItems.map(li => {
              const p2a      = p2?.items[li.lineItemId] ?? ZERO
              const histClick = onRowClick ? () => onRowClick!(li.lineItemId, li.name) : undefined
              const lastA    = isMultiMonth ? (monthLookups![mmLast].lineItems.get(li.lineItemId) ?? ZERO) : ZERO
              const prevA    = isMultiMonth ? (monthLookups![mmPrev].lineItems.get(li.lineItemId) ?? ZERO) : ZERO
              return (
                <tr key={li.lineItemId}
                    className="border-b"
                    style={{ backgroundColor: COGM_ITEM_BG, borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: COGM_BORDER, borderBottomColor: '#f0e8d0' }}>
                  <td className="pl-10 pr-3 py-1.5 text-xs" style={{ color: COGM_TEXT }}>
                    {li.name}
                    {li.subcategoryL1 && <div className="text-[10px] opacity-70 mt-0.5">{li.subcategoryL1}</div>}
                  </td>
                  <OwnerCell value={li.ownerName} showDash />
                  {isMultiMonth ? (
                    <>
                      {months!.map((mc, ci) => {
                        const a  = monthLookups![ci].lineItems.get(li.lineItemId) ?? ZERO
                        const gb = monthLookups![ci].grossBudget
                        const ga = monthLookups![ci].grossActual
                        return (
                          <Fragment key={`${mc.year}-${mc.month}`}>
                            {canEdit ? (
                              <InlineEditCell value={a.budget} onSave={makeSave(li, 'budget', mc.year, mc.month)} />
                            ) : (
                              <AmtCell n={a.budget} />
                            )}
                            <PctCell v={a.budget} base={gb} onClick={histClick} />
                            {canEdit ? (
                              <InlineEditCell value={a.actual} onSave={makeSave(li, 'actual', mc.year, mc.month)} />
                            ) : (
                              <AmtCell n={a.actual} />
                            )}
                            <PctCell v={a.actual} base={ga} onClick={histClick} />
                          </Fragment>
                        )
                      })}
                      {mmN >= 2 && <DeltaCell p1={lastA.actual} p2={prevA.actual} revCtx={false} />}
                    </>
                  ) : (
                    <>
                      {canEdit ? (
                        <>
                          <InlineEditCell value={li.budget} onSave={makeSave(li, 'budget', p1Year, p1Month)} />
                          <PctCell v={li.budget} base={p1gb} onClick={histClick} />
                          <InlineEditCell value={li.actual} onSave={makeSave(li, 'actual', p1Year, p1Month)} />
                          <PctCell v={li.actual} base={p1ga} onClick={histClick} />
                        </>
                      ) : (
                        <>
                          <AmtCell n={li.budget} />
                          <PctCell v={li.budget} base={p1gb} onClick={histClick} />
                          <AmtCell n={li.actual} />
                          <PctCell v={li.actual} base={p1ga} onClick={histClick} />
                        </>
                      )}
                      {hasPeriod2 && (
                        <>
                          <PCols a={p2a} gb={p2!.grossBudget} ga={p2!.grossActual} />
                          <DeltaCell p1={li.actual} p2={p2a.actual} revCtx={false} />
                        </>
                      )}
                    </>
                  )}
                </tr>
              )
            })}

            {/* Total COGM row */}
            {(() => {
              const lastSt = isMultiMonth ? (monthLookups![mmLast].sections.get(section.id) ?? ZERO) : ZERO
              const prevSt = isMultiMonth ? (monthLookups![mmPrev].sections.get(section.id) ?? ZERO) : ZERO
              const p2sec  = p2?.sectionTotals[section.id] ?? ZERO
              return (
                <tr className="border-b" style={{ backgroundColor: COGM_BG, borderBottomColor: COGM_BORDER }}>
                  <td className="px-3 py-2 text-xs font-bold italic" style={{ color: COGM_TEXT }}>
                    {section.totalLabel}
                  </td>
                  <OwnerCell py="py-2" />
                  {isMultiMonth ? (
                    <>
                      {months!.map((mc, ci) => {
                        const st = monthLookups![ci].sections.get(section.id) ?? ZERO
                        const gb = monthLookups![ci].grossBudget
                        const ga = monthLookups![ci].grossActual
                        return (
                          <Fragment key={`${mc.year}-${mc.month}`}>
                            <AmtCell n={st.budget} py="py-2" />
                            <PctCell v={st.budget} base={gb} py="py-2" />
                            <AmtCell n={st.actual} py="py-2" />
                            <PctCell v={st.actual} base={ga} py="py-2" />
                          </Fragment>
                        )
                      })}
                      {mmN >= 2 && <DeltaCell p1={lastSt.actual} p2={prevSt.actual} revCtx={false} py="py-2" />}
                    </>
                  ) : (
                    <>
                      <PCols a={section.total} gb={p1gb} ga={p1ga} py="py-2" />
                      {hasPeriod2 && (
                        <>
                          <PCols a={p2sec} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2" />
                          <DeltaCell p1={section.total.actual} p2={p2sec.actual} revCtx={false} py="py-2" />
                        </>
                      )}
                    </>
                  )}
                </tr>
              )
            })()}

            {/* Inventory movement row */}
            {(() => {
              if (isMultiMonth) {
                return (
                  <tr style={{ backgroundColor: COGM_BG, borderTop: `1px dashed ${COGM_BORDER}` }}>
                    <td colSpan={2} className="px-3 py-1.5 text-[10px] italic" style={{ color: COGM_TEXT }}>
                      Inventory movement
                    </td>
                    {months!.map((mc, ci) => {
                      const cogmSt = monthLookups![ci].sections.get(section.id) ?? ZERO
                      const cogsSt = monthLookups![ci].groups.get(cogsDeptId) ?? ZERO
                      const diff   = cogmSt.actual - cogsSt.actual
                      const dir    = diff > 0 ? 'added to' : diff < 0 ? 'drawn from' : 'no change in'
                      return (
                        <td key={`${mc.year}-${mc.month}`} colSpan={4}
                            className="px-2 py-1.5 text-[10px] italic text-center"
                            style={{ color: COGM_TEXT }}>
                          {thb(cogmSt.actual)} − {thb(cogsSt.actual)} = {thb(Math.abs(diff))} {dir} inv.
                        </td>
                      )
                    })}
                    {mmN >= 2 && <td />}
                  </tr>
                )
              }
              const cogmActual = section.total.actual
              const cogsActual = cogsGroup?.subtotal.actual ?? 0
              const diff       = cogmActual - cogsActual
              const dir        = diff > 0 ? 'added to' : diff < 0 ? 'drawn from' : 'no change in'
              return (
                <tr style={{ backgroundColor: COGM_BG, borderTop: `1px dashed ${COGM_BORDER}` }}>
                  <td colSpan={2 + 4 + (hasPeriod2 ? 5 : 0)}
                      className="px-3 py-1.5 text-[10px] italic"
                      style={{ color: COGM_TEXT }}>
                    COGM {thb(cogmActual)} − COGS own make {thb(cogsActual)} = {thb(Math.abs(diff))} {dir} finished goods inventory
                  </td>
                </tr>
              )
            })()}
          </>
        )}
      </Fragment>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  if (!refData) return null

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <colgroup>
          <col style={{ minWidth: '280px' }} />
          <col style={{ width: '110px' }} />
          {isMultiMonth ? (
            <>
              {months!.map(mc => (
                <Fragment key={`${mc.year}-${mc.month}`}>
                  <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
                  <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
                </Fragment>
              ))}
              {mmN >= 2 && <col style={{ width: '78px' }} />}
            </>
          ) : (
            <>
              <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
              <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
              {hasPeriod2 && (
                <>
                  <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
                  <col style={{ width: '112px' }} /><col style={{ width: '62px' }} />
                  <col style={{ width: '78px' }} />
                </>
              )}
            </>
          )}
        </colgroup>

        <thead className="sticky top-0 z-10">
          {isMultiMonth ? (
            <>
              <tr className="bg-slate-800 text-white">
                <th rowSpan={2} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-b border-slate-600 align-bottom">
                  Line Item
                </th>
                <th rowSpan={2} className="px-2 py-2.5 text-left text-[11px] font-medium text-slate-400 border-b border-slate-600 align-bottom uppercase tracking-wider">
                  Owner
                </th>
                {months!.map(mc => (
                  <th key={`${mc.year}-${mc.month}`} colSpan={4} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider border-b border-l border-slate-600">
                    {mc.label}
                  </th>
                ))}
                {mmN >= 2 && (
                  <th rowSpan={2} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider border-b border-l border-slate-600 align-bottom">
                    MoM Δ%
                  </th>
                )}
              </tr>
              <tr className="bg-slate-700 text-slate-200 text-xs">
                {months!.map(mc =>
                  (['Budget', '%Rev', 'Actual', '%Rev'] as const).map((h, i) => (
                    <th key={`${mc.year}-${mc.month}-${i}`} className={`px-2 py-1.5 text-right font-medium whitespace-nowrap ${i === 0 ? 'border-l border-slate-600' : ''}`}>
                      {h}
                    </th>
                  ))
                )}
              </tr>
            </>
          ) : (
            <>
              <tr className="bg-slate-800 text-white">
                <th rowSpan={2} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider border-b border-slate-600 align-bottom">
                  Line Item
                </th>
                <th rowSpan={2} className="px-2 py-2.5 text-left text-[11px] font-medium text-slate-400 border-b border-slate-600 align-bottom uppercase tracking-wider">
                  Owner
                </th>
                <th colSpan={4} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider border-b border-l border-slate-600">
                  {period1!.label}
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
            </>
          )}
        </thead>

        <tbody className="bg-white">
          {refData.sections.map(section => {
            if (section.id === 'cogm_schedule') return renderCogmSchedule(section)
            const hasItems      = section.groups.some(g => g.lineItems.length > 0)
            if (!hasItems) return null
            const isSectionOpen = collapse.sections[section.id] ?? false
            const isOpex        = section.id === OPEX_ID
            const nonEmpty      = section.groups.filter(g => g.lineItems.length > 0)
            const calcRows      = showCalculatedRows
              ? refData.calculatedRows.filter(r => r.afterSectionId === section.id)
              : []
            const sectionRevCtx = REV_IDS.has(section.id)
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
                  {isMultiMonth ? (
                    <>
                      {months!.map((mc, ci) => {
                        const st = monthLookups![ci].sections.get(section.id) ?? ZERO
                        const gb = monthLookups![ci].grossBudget
                        const ga = monthLookups![ci].grossActual
                        return (
                          <Fragment key={`${mc.year}-${mc.month}`}>
                            <AmtCell n={st.budget} py="py-2.5" />
                            <PctCell v={st.budget} base={gb} py="py-2.5" />
                            <AmtCell n={st.actual} py="py-2.5" />
                            <PctCell v={st.actual} base={ga} py="py-2.5" />
                          </Fragment>
                        )
                      })}
                      {mmN >= 2 && (() => {
                        const lastSt = monthLookups![mmLast].sections.get(section.id) ?? ZERO
                        const prevSt = monthLookups![mmPrev].sections.get(section.id) ?? ZERO
                        return <DeltaCell p1={lastSt.actual} p2={prevSt.actual} revCtx={sectionRevCtx} py="py-2.5" />
                      })()}
                    </>
                  ) : (
                    <>
                      <PCols a={section.total} gb={p1gb} ga={p1ga} py="py-2.5" />
                      {hasPeriod2 && (
                        <>
                          <PCols a={p2sec} gb={p2!.grossBudget} ga={p2!.grossActual} py="py-2.5" />
                          <DeltaCell p1={section.total.actual} p2={p2sec.actual} revCtx={sectionRevCtx} py="py-2.5" />
                        </>
                      )}
                    </>
                  )}
                </tr>
                {isSectionOpen && (
                  <>
                    {nonEmpty.map(g => {
                      if (section.id === 'cost_of_goods' && g.deptCode === 'COGS' && g.lineItems.length === 1)
                        return isMultiMonth ? renderCogsFlatRowMM(g, section) : renderCogsFlatRowCmp(g, section)
                      if (isMultiMonth) return isOpex ? renderOpexGroupMM(g, section) : renderStdGroupMM(g, section)
                      return isOpex ? renderOpexGroupCmp(g, section) : renderStdGroupCmp(g, section)
                    })}
                    {isMultiMonth ? renderSectionTotalMM(section) : renderSectionTotalCmp(section)}
                  </>
                )}
                {calcRows.map(cr => isMultiMonth ? renderCalcRowMM(cr) : renderCalcRowCmp(cr))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
