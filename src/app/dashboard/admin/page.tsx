import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import AdminDashboard from './AdminDashboard'
import { getPLData, getPLDataAggregated, getCalcRow, getComparisonPeriods } from '@/lib/pl-data'
import type { PLData } from '@/lib/pl-data'

async function fetchPeriod(periods: Array<{ year: number; month: number }>): Promise<PLData> {
  return periods.length === 1
    ? getPLData(periods[0].year, periods[0].month)
    : getPLDataAggregated(periods)
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') redirect('/login')

  const sp   = await searchParams
  const mode = sp.mode ?? 'mom'

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  const { p1, p2, p1Label, p2Label, deltaLabel } = getComparisonPeriods(mode, year, month)

  const [period1Data, period2Data] = await Promise.all([
    fetchPeriod(p1),
    fetchPeriod(p2),
  ])

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
