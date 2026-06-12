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

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; anchor?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  const sp   = await searchParams
  const mode = sp.mode ?? '3month'

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const anchor = sp.anchor ?? `${year}-${String(month).padStart(2, '0')}`

  if (mode === '3month') {
    const [ay, am] = anchor.split('-').map(Number)
    const periods3 = [shiftM(ay, am, -2), shiftM(ay, am, -1), { year: ay, month: am }]
    const monthsData = await getPLDataForMonths(periods3)
    const latestData = monthsData[monthsData.length - 1]
    const revSection = latestData.sections.find(s => s.id === 'revenue_channel')
    const grossProfit = getCalcRow(latestData, 'gross_profit')
    const opIncome    = getCalcRow(latestData, 'operating_income')
    const netIncome   = getCalcRow(latestData, 'net_income')
    const months: MonthColumn[] = periods3.map((p, i) => ({
      year: p.year, month: p.month,
      label: `${MN[p.month - 1]} ${p.year}`,
      data: monthsData[i],
    }))
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <NavHeader userName={user.full_name ?? user.email} role={user.role} />
        <main className="flex-1">
          <AdminDashboard
            mode={mode}
            anchor={anchor}
            months={months}
            summaryCards={{
              revenue:     revSection?.total.actual ?? 0,
              grossProfit: grossProfit?.actual      ?? 0,
              opIncome:    opIncome?.actual         ?? 0,
              netIncome:   netIncome?.actual        ?? 0,
            }}
            userId={user.id}
          />
        </main>
      </div>
    )
  }

  // QoQ / YoY comparison modes
  const { p1, p2, p1Label, p2Label, deltaLabel } = getComparisonPeriods(mode, year, month)
  const [period1Data, period2Data] = await Promise.all([fetchPeriod(p1), fetchPeriod(p2)])
  const revSection  = period1Data.sections.find(s => s.id === 'revenue_channel')
  const grossProfit = getCalcRow(period1Data, 'gross_profit')
  const opIncome    = getCalcRow(period1Data, 'operating_income')
  const netIncome   = getCalcRow(period1Data, 'net_income')

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1">
        <AdminDashboard
          mode={mode}
          anchor={anchor}
          period1={{ label: p1Label, data: period1Data }}
          period2={{ label: p2Label, data: period2Data }}
          deltaLabel={deltaLabel}
          summaryCards={{
            revenue:     revSection?.total.actual ?? 0,
            grossProfit: grossProfit?.actual      ?? 0,
            opIncome:    opIncome?.actual         ?? 0,
            netIncome:   netIncome?.actual        ?? 0,
          }}
          userId={user.id}
        />
      </main>
    </div>
  )
}
