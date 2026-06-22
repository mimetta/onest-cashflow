import 'server-only'
import { createSupabaseServerClient } from './supabase-server'
import { PL_SECTIONS, PL_CALCULATED_ROWS } from './pl-structure'
import {
  ZERO, amounts, addAmounts,
  type Amounts, type PLLineItemRow, type PLGroupData,
  type PLSectionData, type PLCalcRowData, type PLData,
} from './pl-types'

// Re-export everything so server components can import from one place
export type {
  Amounts, PLLineItemRow, PLGroupData, PLSectionData, PLCalcRowData, PLData, MonthColumn,
} from './pl-types'
export { ZERO, amounts, addAmounts } from './pl-types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function scaleAmounts(a: Amounts, sign: 1 | -1): Amounts {
  return amounts(sign * a.budget, sign * a.actual)
}

// ── Internal builder ──────────────────────────────────────────────────────────

function buildPLDataFromMaps({
  year, month, lineItemsData, deptsData, budgetMap, actualMap,
}: {
  year: number
  month: number
  lineItemsData: any[]
  deptsData: { id: string; code: string; full_name: string; owner_name?: string | null }[]
  budgetMap: Record<string, number>
  actualMap: Record<string, number>
}): PLData {
  // UUID + owner lookup: `${code}|${full_name}` → id
  const deptUuidMap:  Record<string, string>         = {}
  const deptOwnerMap: Record<string, string | null>  = {}
  for (const d of deptsData) {
    const key = `${d.code}|${d.full_name}`
    deptUuidMap[key]  = d.id
    deptOwnerMap[d.id] = d.owner_name ?? null
  }

  // dept key → line items
  const deptMap: Record<string, PLLineItemRow[]> = {}
  for (const li of lineItemsData) {
    const cat  = (li as any).categories
    const dept = cat?.departments
    if (!dept?.code || !dept?.full_name) continue
    const key    = `${dept.code}|${dept.full_name}`
    const budget = budgetMap[li.id] ?? 0
    const actual = actualMap[li.id] ?? 0
    // For OEM, use category name as sub-label when it differs from the item name
    // (distinguishes "Raw Materials (Replenishing)" from "Raw Materials (NPD)" etc.)
    const subLabel: string | null = li.subcategory_l1
      ?? (dept.code === 'OEM' && cat.name !== li.name ? cat.name : null)
    ;(deptMap[key] ??= []).push({
      lineItemId:        li.id,
      name:              li.name,
      subcategoryL1:     subLabel,
      categoryId:        cat.id ?? '',
      categoryName:      cat.name ?? '',
      categoryOwnerName: cat.owner_name ?? null,
      cogmGroup:         (cat as any).cogm_group ?? null,
      isHrCategory:      cat.is_hr_category ?? false,
      lineItemType:      li.type ?? 'EXPENSE',
      ownerName:         (li as any).owner_name ?? null,
      ...amounts(budget, actual),
    })
  }

  const totalsLookup: Record<string, Amounts> = {}

  const sections: PLSectionData[] = PL_SECTIONS.map(section => {
    const groups: PLGroupData[] = section.groups.map(group => {
      const key       = `${group.deptCode}|${group.deptFullName}`
      const deptId    = deptUuidMap[key] ?? ''
      const lineItems = (deptMap[key] ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
      const subtotal  = lineItems.reduce(addAmounts, ZERO)
      return {
        deptCode:     group.deptCode,
        deptFullName: group.deptFullName,
        departmentId: deptId,
        subtotalLabel: group.subtotalLabel,
        lineItems,
        subtotal,
        ownerName:    deptOwnerMap[deptId] ?? group.defaultOwnerName ?? null,
      }
    })
    const total = groups.reduce((acc, g) => addAmounts(acc, g.subtotal), ZERO)
    totalsLookup[section.totalId] = total
    return { id: section.id, title: section.title, totalLabel: section.totalLabel, totalId: section.totalId, note: section.note, hideOwner: section.hideOwner, groups, total }
  })

  const calculatedRows: PLCalcRowData[] = PL_CALCULATED_ROWS.map(calcRow => {
    const result = calcRow.terms.reduce((acc, term) => {
      const src = totalsLookup[term.sectionTotalId] ?? ZERO
      return addAmounts(acc, scaleAmounts(src, term.sign))
    }, ZERO)
    totalsLookup[calcRow.id] = result
    return { id: calcRow.id, label: calcRow.label, afterSectionId: calcRow.afterSectionId, ...result }
  })

  return { year, month, sections, calculatedRows }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch P&L data for a single month. */
export async function getPLData(year: number, month: number): Promise<PLData> {
  const monthDate = `${year}-${String(month).padStart(2, '0')}-01`
  const supabase  = await createSupabaseServerClient()

  const nextYear      = month === 12 ? year + 1 : year
  const nextMonth     = month === 12 ? 1 : month + 1
  const nextMonthDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const [lineItemsRes, deptsRes, budgetsRes, expensesRes] = await Promise.all([
    supabase.from('line_items').select(`
      id, name, subcategory_l1, type, owner_name,
      categories ( id, name, cogm_group, owner_name, is_hr_category, departments ( id, code, full_name ) )
    `).order('name'),
    supabase.from('departments').select('id, code, full_name, owner_name'),
    supabase.from('budget_submissions')
      .select('line_item_id, amount')
      .gte('month', monthDate).lt('month', nextMonthDate).eq('status', 'approved'),
    supabase.from('expenses')
      .select('line_item_id, amount')
      .eq('status', 'approved').eq('month', monthDate),
  ])

  const budgetMap: Record<string, number> = {}
  for (const r of (budgetsRes.data ?? [])) {
    budgetMap[r.line_item_id] = (budgetMap[r.line_item_id] ?? 0) + Number(r.amount)
  }
  const actualMap: Record<string, number> = {}
  for (const r of (expensesRes.data ?? [])) {
    actualMap[r.line_item_id] = (actualMap[r.line_item_id] ?? 0) + Number(r.amount)
  }

  return buildPLDataFromMaps({
    year, month,
    lineItemsData: lineItemsRes.data ?? [],
    deptsData:     deptsRes.data     ?? [],
    budgetMap, actualMap,
  })
}

/** Fetch P&L data for multiple months and sum all amounts. */
export async function getPLDataAggregated(
  periods: Array<{ year: number; month: number }>
): Promise<PLData> {
  if (periods.length === 0) throw new Error('No periods specified')
  if (periods.length === 1) return getPLData(periods[0].year, periods[0].month)

  const supabase = await createSupabaseServerClient()

  const monthDates = periods.map(p => `${p.year}-${String(p.month).padStart(2, '0')}-01`)

  const [lineItemsRes, deptsRes, budgetRes, expensesRes] = await Promise.all([
    supabase.from('line_items').select(`
      id, name, subcategory_l1, type, owner_name,
      categories ( id, name, cogm_group, owner_name, is_hr_category, departments ( id, code, full_name ) )
    `).order('name'),
    supabase.from('departments').select('id, code, full_name, owner_name'),
    supabase.from('budget_submissions')
      .select('line_item_id, amount')
      .in('month', monthDates).eq('status', 'approved'),
    supabase.from('expenses')
      .select('line_item_id, amount')
      .eq('status', 'approved')
      .in('month', monthDates),
  ])

  const budgetMap: Record<string, number> = {}
  for (const r of (budgetRes.data ?? [])) {
    budgetMap[r.line_item_id] = (budgetMap[r.line_item_id] ?? 0) + Number(r.amount)
  }
  const actualMap: Record<string, number> = {}
  for (const r of (expensesRes.data ?? [])) {
    actualMap[r.line_item_id] = (actualMap[r.line_item_id] ?? 0) + Number(r.amount)
  }

  return buildPLDataFromMaps({
    year: periods[0].year, month: periods[0].month,
    lineItemsData: lineItemsRes.data ?? [],
    deptsData:     deptsRes.data     ?? [],
    budgetMap, actualMap,
  })
}

/**
 * Fetch P&L data for each period in one batch of 4 DB queries (vs 4×N).
 * Returns one PLData per period in the same order as the input.
 */
export async function getPLDataForMonths(
  periods: Array<{ year: number; month: number }>,
): Promise<PLData[]> {
  if (periods.length === 0) return []

  const supabase   = await createSupabaseServerClient()
  const monthDates = periods.map(p => `${p.year}-${String(p.month).padStart(2, '0')}-01`)

  const [lineItemsRes, deptsRes, budgetsRes, expensesRes] = await Promise.all([
    supabase.from('line_items').select(`
      id, name, subcategory_l1, type, owner_name,
      categories ( id, name, cogm_group, owner_name, is_hr_category, departments ( id, code, full_name ) )
    `).order('name'),
    supabase.from('departments').select('id, code, full_name, owner_name'),
    supabase.from('budget_submissions')
      .select('line_item_id, amount, month')
      .in('month', monthDates).eq('status', 'approved'),
    supabase.from('expenses')
      .select('line_item_id, amount, month')
      .eq('status', 'approved').in('month', monthDates),
  ])

  return periods.map((p, i) => {
    const md = monthDates[i]
    const budgetMap: Record<string, number> = {}
    for (const r of (budgetsRes.data ?? [])) {
      if (String(r.month).slice(0, 10) === md)
        budgetMap[r.line_item_id] = (budgetMap[r.line_item_id] ?? 0) + Number(r.amount)
    }
    const actualMap: Record<string, number> = {}
    for (const r of (expensesRes.data ?? [])) {
      if (String(r.month).slice(0, 10) === md)
        actualMap[r.line_item_id] = (actualMap[r.line_item_id] ?? 0) + Number(r.amount)
    }
    return buildPLDataFromMaps({
      year:         p.year,
      month:        p.month,
      lineItemsData: lineItemsRes.data ?? [],
      deptsData:    deptsRes.data     ?? [],
      budgetMap,
      actualMap,
    })
  })
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function rebuildCalcRows(sections: PLSectionData[]): PLCalcRowData[] {
  const totalsLookup: Record<string, Amounts> = {}
  for (const s of sections) totalsLookup[s.totalId] = s.total
  return PL_CALCULATED_ROWS.map(calcRow => {
    const result = calcRow.terms.reduce((acc, term) => {
      const src = totalsLookup[term.sectionTotalId] ?? ZERO
      return addAmounts(acc, scaleAmounts(src, term.sign))
    }, ZERO)
    totalsLookup[calcRow.id] = result
    return { id: calcRow.id, label: calcRow.label, afterSectionId: calcRow.afterSectionId, ...result }
  })
}

/** Keep only the groups belonging to the given department UUID. */
export function filterPLDataByDepartment(data: PLData, departmentId: string): PLData {
  return filterPLDataByDepartments(data, [departmentId])
}

/** Keep only the groups belonging to any of the given department UUIDs. */
export function filterPLDataByDepartments(data: PLData, departmentIds: string[]): PLData {
  const idSet = new Set(departmentIds)
  const sections = data.sections
    .map(section => {
      const groups = section.groups.filter(g => idSet.has(g.departmentId))
      const total  = groups.reduce((acc, g) => addAmounts(acc, g.subtotal), ZERO)
      return { ...section, groups, total }
    })
    .filter(s => s.groups.length > 0)
  return { ...data, sections, calculatedRows: rebuildCalcRows(sections) }
}

/** Keep only line items where isHrCategory === true. */
export function filterPLDataByHRCategory(data: PLData): PLData {
  const sections = data.sections
    .map(section => {
      const groups = section.groups
        .map(group => {
          const lineItems = group.lineItems.filter(li => li.isHrCategory)
          return { ...group, lineItems, subtotal: lineItems.reduce(addAmounts, ZERO) }
        })
        .filter(g => g.lineItems.length > 0)
      const total = groups.reduce((acc, g) => addAmounts(acc, g.subtotal), ZERO)
      return { ...section, groups, total }
    })
    .filter(s => s.groups.length > 0)
  return { ...data, sections, calculatedRows: rebuildCalcRows(sections) }
}

// ── Convenience accessor ──────────────────────────────────────────────────────

export function getCalcRow(
  data: PLData,
  id: 'net_revenue' | 'gross_profit' | 'net_income',
): PLCalcRowData | undefined {
  return data.calculatedRows.find(r => r.id === id)
}

/** Derive comparison periods from a mode string. */
export function getComparisonPeriods(
  mode: string, year: number, month: number,
): {
  p1: Array<{ year: number; month: number }>
  p2: Array<{ year: number; month: number }>
  p1Label: string
  p2Label: string
  deltaLabel: string
} {
  const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  if (mode === 'qoq') {
    const q  = Math.ceil(month / 3)
    const qs = (q - 1) * 3 + 1
    const p1 = [qs, qs+1, qs+2].filter(m => m <= month).map(m => ({ year, month: m }))
    let pq = q - 1, py = year
    if (pq === 0) { pq = 4; py = year - 1 }
    const pqs = (pq - 1) * 3 + 1
    const p2  = [pqs, pqs+1, pqs+2].map(m => ({ year: py, month: m }))
    return { p1, p2, p1Label: `Q${q} ${year}`, p2Label: `Q${pq} ${py}`, deltaLabel: 'QoQ Δ%' }
  }

  if (mode === 'yoy') {
    return {
      p1: [{ year, month }],
      p2: [{ year: year - 1, month }],
      p1Label:    `${MN[month-1]} ${year}`,
      p2Label:    `${MN[month-1]} ${year-1}`,
      deltaLabel: 'YoY Δ%',
    }
  }

  // Default: MoM
  const p2m = month > 1 ? { year, month: month-1 } : { year: year-1, month: 12 }
  return {
    p1: [{ year, month }],
    p2: [p2m],
    p1Label:    `${MN[month-1]} ${year}`,
    p2Label:    `${MN[p2m.month-1]} ${p2m.year}`,
    deltaLabel: 'MoM Δ%',
  }
}
