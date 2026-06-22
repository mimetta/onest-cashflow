import type { ReactNode } from 'react'
import type { Role } from '@/types'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import AdminDashboard from './AdminDashboard'
import { getPLData, getPLDataAggregated, getPLDataForMonths, getCalcRow, getComparisonPeriods } from '@/lib/pl-data'
import type { PLData, MonthColumn } from '@/lib/pl-data'

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

function wrap(children: ReactNode, userName: string, role: Role) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={userName} role={role} />
      <main className="flex-1">{children}</main>
    </div>
  )
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; anchor?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  const sp     = await searchParams
  const mode   = sp.mode ?? '3month'
  const now    = new Date()
  const year   = now.getFullYear()
  const month  = now.getMonth() + 1
  const anchor = sp.anchor ?? `${year}-${String(month).padStart(2, '0')}`

  // ── 3-Month view ─────────────────────────────────────────────────────────────
  if (mode === '3month') {
    const [ay, am] = anchor.split('-').map(Number)
    const periods3  = [shiftM(ay, am, -2), shiftM(ay, am, -1), { year: ay, month: am }]
    const monthsData = await getPLDataForMonths(periods3)
    const months: MonthColumn[] = periods3.map((p, i) => ({
      year: p.year, month: p.month,
      label: `${MN[p.month - 1]} ${p.year}`,
      data:  monthsData[i],
    }))
    return wrap(
      <AdminDashboard mode={mode} anchor={anchor} months={months}
        summaryCards={kpiFrom(lastWithData(monthsData))} userId={user.id} />,
      user.name ?? user.email, user.role as Role,
    )
  }

  // ── Quarterly view — all 4 quarters of selected year ─────────────────────────
  if (mode === 'quarterly') {
    const yr = parseInt(anchor.split('-')[0])
    const [q1, q2, q3, q4] = await Promise.all([
      getPLDataAggregated([{year:yr,month:1},{year:yr,month:2},{year:yr,month:3}]),
      getPLDataAggregated([{year:yr,month:4},{year:yr,month:5},{year:yr,month:6}]),
      getPLDataAggregated([{year:yr,month:7},{year:yr,month:8},{year:yr,month:9}]),
      getPLDataAggregated([{year:yr,month:10},{year:yr,month:11},{year:yr,month:12}]),
    ])
    const months: MonthColumn[] = [
      { year: yr, month: 1,  label: `Q1 ${yr}`, data: q1 },
      { year: yr, month: 4,  label: `Q2 ${yr}`, data: q2 },
      { year: yr, month: 7,  label: `Q3 ${yr}`, data: q3 },
      { year: yr, month: 10, label: `Q4 ${yr}`, data: q4 },
    ]
    return wrap(
      <AdminDashboard mode={mode} anchor={anchor} months={months}
        summaryCards={kpiFrom(lastWithData([q1,q2,q3,q4]))} userId={user.id} />,
      user.name ?? user.email, user.role as Role,
    )
  }

  // ── Annual view — selected year vs prior year ─────────────────────────────────
  if (mode === 'annual') {
    const yr = parseInt(anchor.split('-')[0])
    const thisYr = Array.from({length:12}, (_,i) => ({year:yr,   month:i+1}))
    const lastYr = Array.from({length:12}, (_,i) => ({year:yr-1, month:i+1}))
    const [period1Data, period2Data] = await Promise.all([
      getPLDataAggregated(thisYr),
      getPLDataAggregated(lastYr),
    ])
    return wrap(
      <AdminDashboard mode={mode} anchor={anchor}
        period1={{ label: `${yr}`, data: period1Data }}
        period2={{ label: `${yr-1}`, data: period2Data }}
        deltaLabel="YoY Δ%"
        summaryCards={kpiFrom(period1Data)} userId={user.id} />,
      user.name ?? user.email, user.role as Role,
    )
  }

  // ── YoY / QoQ comparison modes ────────────────────────────────────────────────
  const { p1, p2, p1Label, p2Label, deltaLabel } = getComparisonPeriods(mode, year, month)
  const [period1Data, period2Data] = await Promise.all([fetchPeriod(p1), fetchPeriod(p2)])
  return wrap(
    <AdminDashboard mode={mode} anchor={anchor}
      period1={{ label: p1Label, data: period1Data }}
      period2={{ label: p2Label, data: period2Data }}
      deltaLabel={deltaLabel}
      summaryCards={kpiFrom(period1Data)} userId={user.id} />,
    user.name ?? user.email, user.role as Role,
  )
}
