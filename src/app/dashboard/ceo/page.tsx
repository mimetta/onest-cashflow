import type { ReactNode } from 'react'
import type { Role } from '@/types'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import NavHeader from '@/components/NavHeader'
import CeoDashboard from './CeoDashboard'
import {
  getPLData, getPLDataAggregated, getPLDataForMonths,
  getCalcRow, getComparisonPeriods, filterPLDataByHRCategory,
} from '@/lib/pl-data'
import type { PLData, MonthColumn } from '@/lib/pl-data'

export type PendingRow = {
  id: string
  departmentName: string
  categoryName: string
  lineItemName: string
  lineItemType: string
  submittedByName: string
  year: number
  month: number
  amount: number
  submittedAt: string | null
}

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

async function fetchPeriod(periods: Array<{ year: number; month: number }>): Promise<PLData> {
  return periods.length === 1
    ? getPLData(periods[0].year, periods[0].month)
    : getPLDataAggregated(periods)
}

function shiftM(y: number, m: number, d: number) {
  let nm = m + d, ny = y
  while (nm <= 0) { nm += 12; ny-- }
  while (nm > 12) { nm -= 12; ny++ }
  return { year: ny, month: nm }
}

function kpiFrom(data: PLData) {
  const revSection  = data.sections.find(s => s.id === 'revenue_channel')
  const grossProfit = getCalcRow(data, 'gross_profit')
  const opIncome    = getCalcRow(data, 'net_revenue')
  const netProfit   = getCalcRow(data, 'net_profit')
  return {
    revenue:     { budget: revSection?.total.budget ?? 0, actual: revSection?.total.actual ?? 0 },
    grossProfit: { budget: grossProfit?.budget ?? 0, actual: grossProfit?.actual ?? 0 },
    opIncome:    { budget: opIncome?.budget    ?? 0, actual: opIncome?.actual    ?? 0 },
    netProfit:   { budget: netProfit?.budget   ?? 0, actual: netProfit?.actual   ?? 0 },
  }
}

function lastWithData(dataArr: PLData[]): PLData {
  return [...dataArr].reverse().find(d => d.sections.some(s => s.total.budget > 0))
    ?? dataArr[dataArr.length - 1]
}

async function fetchPending(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const res = await supabase
    .from('budget_submissions')
    .select(`
      id, month, amount, submitted_at,
      line_items ( name, type, categories ( name, departments ( full_name ) ) ),
      users ( name )
    `)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })
  return (res.data ?? []).map((row: any): PendingRow => {
    const d  = row.month ? new Date(row.month) : null
    return {
      id:              row.id,
      departmentName:  row.line_items?.categories?.departments?.full_name ?? '—',
      categoryName:    row.line_items?.categories?.name                   ?? '—',
      lineItemName:    row.line_items?.name                               ?? '—',
      lineItemType:    row.line_items?.type                               ?? 'EXPENSE',
      submittedByName: row.users?.name ?? '—',
      year:  d ? d.getUTCFullYear() : 0,
      month: d ? d.getUTCMonth() + 1 : 0,
      amount:      Number(row.amount),
      submittedAt: row.submitted_at,
    }
  })
}

export default async function CeoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; anchor?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ceo') redirect('/login')
  const u = user

  const sp     = await searchParams
  const mode   = sp.mode ?? '3month'
  const now    = new Date()
  const year   = now.getFullYear()
  const month  = now.getMonth() + 1
  const anchor = sp.anchor ?? `${year}-${String(month).padStart(2, '0')}`

  const supabase = await createSupabaseServerClient()
  const pendingSubmissions = await fetchPending(supabase)

  function shell(content: ReactNode) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <NavHeader userName={u.name ?? u.email} role={u.role as Role} />
        <main className="flex-1">{content}</main>
      </div>
    )
  }

  // ── 3-Month view ─────────────────────────────────────────────────────────────
  if (mode === '3month') {
    const [ay, am] = anchor.split('-').map(Number)
    const periods3   = [shiftM(ay, am, -2), shiftM(ay, am, -1), { year: ay, month: am }]
    const monthsData = await getPLDataForMonths(periods3)
    const kpiData    = lastWithData(monthsData)
    const latestData = monthsData[monthsData.length - 1]
    const prevData   = monthsData[monthsData.length - 2]
    const hrData1    = filterPLDataByHRCategory(latestData)
    const hrData2    = filterPLDataByHRCategory(prevData)
    const hrBudget   = hrData1.sections.reduce((sum, s) => sum + s.total.budget, 0)
    const hrActual   = hrData1.sections.reduce((sum, s) => sum + s.total.actual, 0)
    const p3 = periods3[periods3.length - 1]
    const p2 = periods3[periods3.length - 2]
    const months: MonthColumn[] = periods3.map((p, i) => ({
      year: p.year, month: p.month,
      label: `${MN[p.month - 1]} ${p.year}`, data: monthsData[i],
    }))
    return shell(
      <CeoDashboard mode={mode} anchor={anchor} months={months}
        summaryCards={kpiFrom(kpiData)}
        hrPeriod1={{ label: `${MN[p3.month-1]} ${p3.year}`, data: hrData1 }}
        hrPeriod2={{ label: `${MN[p2.month-1]} ${p2.year}`, data: hrData2 }}
        hrKpis={{ budget: hrBudget, actual: hrActual, revenue: kpiFrom(kpiData).revenue.actual }}
        pendingSubmissions={pendingSubmissions} />
    )
  }

  // ── Quarterly view ────────────────────────────────────────────────────────────
  if (mode === 'quarterly') {
    const [ay, am] = anchor.split('-').map(Number)
    const yr   = ay
    const qIdx = am <= 3 ? 0 : am <= 6 ? 1 : am <= 9 ? 2 : 3
    const [q1,q2,q3,q4] = await Promise.all([
      getPLDataAggregated([{year:yr,month:1},{year:yr,month:2},{year:yr,month:3}]),
      getPLDataAggregated([{year:yr,month:4},{year:yr,month:5},{year:yr,month:6}]),
      getPLDataAggregated([{year:yr,month:7},{year:yr,month:8},{year:yr,month:9}]),
      getPLDataAggregated([{year:yr,month:10},{year:yr,month:11},{year:yr,month:12}]),
    ])
    const allQ    = [q1,q2,q3,q4]
    const kpiData = allQ[qIdx].sections.some(s => s.total.budget > 0)
      ? allQ[qIdx]
      : lastWithData(allQ)
    const hrD1    = filterPLDataByHRCategory(kpiData)
    const months: MonthColumn[] = [
      { year: yr, month: 1,  label: `Q1 ${yr}`, data: q1 },
      { year: yr, month: 4,  label: `Q2 ${yr}`, data: q2 },
      { year: yr, month: 7,  label: `Q3 ${yr}`, data: q3 },
      { year: yr, month: 10, label: `Q4 ${yr}`, data: q4 },
    ]
    const qLabels = ['Q1','Q2','Q3','Q4']
    const hrBudget = hrD1.sections.reduce((sum,s)=>sum+s.total.budget, 0)
    const hrActual = hrD1.sections.reduce((sum,s)=>sum+s.total.actual, 0)
    const prevQ    = qIdx > 0 ? qIdx - 1 : 0
    return shell(
      <CeoDashboard mode={mode} anchor={anchor} months={months}
        summaryCards={kpiFrom(kpiData)}
        hrPeriod1={{ label: `${qLabels[qIdx]} ${yr}`, data: filterPLDataByHRCategory(allQ[qIdx]) }}
        hrPeriod2={{ label: `${qLabels[prevQ]} ${yr}`, data: filterPLDataByHRCategory(allQ[prevQ]) }}
        hrKpis={{ budget: hrBudget, actual: hrActual, revenue: kpiFrom(kpiData).revenue.actual }}
        pendingSubmissions={pendingSubmissions} />
    )
  }

  // ── Annual view ───────────────────────────────────────────────────────────────
  if (mode === 'annual') {
    const yr = parseInt(anchor.split('-')[0])
    const [period1Data, period2Data] = await Promise.all([
      getPLDataAggregated(Array.from({length:12}, (_,i) => ({year:yr,   month:i+1}))),
      getPLDataAggregated(Array.from({length:12}, (_,i) => ({year:yr-1, month:i+1}))),
    ])
    const hrD1 = filterPLDataByHRCategory(period1Data)
    const hrD2 = filterPLDataByHRCategory(period2Data)
    const hrBudget = hrD1.sections.reduce((sum,s)=>sum+s.total.budget,0)
    const hrActual = hrD1.sections.reduce((sum,s)=>sum+s.total.actual,0)
    return shell(
      <CeoDashboard mode={mode} anchor={anchor}
        period1={{ label: `${yr}`, data: period1Data }}
        period2={{ label: `${yr-1}`, data: period2Data }}
        deltaLabel="YoY Δ%"
        deltaSubtitle={`${yr} vs ${yr - 1}`}
        summaryCards={kpiFrom(period1Data)}
        hrPeriod1={{ label: `${yr}`, data: hrD1 }}
        hrPeriod2={{ label: `${yr-1}`, data: hrD2 }}
        hrKpis={{ budget: hrBudget, actual: hrActual, revenue: kpiFrom(period1Data).revenue.actual }}
        pendingSubmissions={pendingSubmissions} />
    )
  }

  // ── YoY / QoQ comparison modes ────────────────────────────────────────────────
  const [ay, am] = anchor.split('-').map(Number)
  const { p1, p2, p1Label, p2Label, deltaLabel } = getComparisonPeriods(mode, ay || year, am || month)
  const [period1Data, period2Data] = await Promise.all([fetchPeriod(p1), fetchPeriod(p2)])
  const hrD1     = filterPLDataByHRCategory(period1Data)
  const hrD2     = filterPLDataByHRCategory(period2Data)
  const hrBudget = hrD1.sections.reduce((sum, s) => sum + s.total.budget, 0)
  const hrActual = hrD1.sections.reduce((sum, s) => sum + s.total.actual, 0)
  return shell(
    <CeoDashboard mode={mode} anchor={anchor}
      period1={{ label: p1Label, data: period1Data }}
      period2={{ label: p2Label, data: period2Data }}
      deltaLabel={deltaLabel}
      deltaSubtitle={`${p1Label} vs ${p2Label}`}
      summaryCards={kpiFrom(period1Data)}
      hrPeriod1={{ label: p1Label, data: hrD1 }}
      hrPeriod2={{ label: p2Label, data: hrD2 }}
      hrKpis={{ budget: hrBudget, actual: hrActual, revenue: kpiFrom(period1Data).revenue.actual }}
      pendingSubmissions={pendingSubmissions} />
  )
}
