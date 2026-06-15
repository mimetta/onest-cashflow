import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import HrDashboard from './HrDashboard'
import {
  getPLData, getPLDataAggregated, filterPLDataByHRCategory,
  getComparisonPeriods,
} from '@/lib/pl-data'
import type { PLData } from '@/lib/pl-data'

async function fetchPeriod(periods: Array<{ year: number; month: number }>): Promise<PLData> {
  return periods.length === 1
    ? getPLData(periods[0].year, periods[0].month)
    : getPLDataAggregated(periods)
}

export default async function HrDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'hr') redirect('/login')

  const sp   = await searchParams
  const mode = sp.mode ?? 'mom'

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  const { p1, p2, p1Label, p2Label, deltaLabel } = getComparisonPeriods(mode, year, month)

  const [raw1, raw2] = await Promise.all([
    fetchPeriod(p1),
    fetchPeriod(p2),
  ])

  // HR-filtered data for the primary table
  const period1Data = filterPLDataByHRCategory(raw1)
  const period2Data = filterPLDataByHRCategory(raw2)

  // Compute per-category KPI totals
  const hrKpis: Record<string, { budget: number; actual: number }> = {}
  for (const section of period1Data.sections) {
    for (const group of section.groups) {
      for (const item of group.lineItems) {
        if (!hrKpis[item.categoryName]) hrKpis[item.categoryName] = { budget: 0, actual: 0 }
        hrKpis[item.categoryName].budget += item.budget
        hrKpis[item.categoryName].actual += item.actual
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.name ?? user.email} role={user.role} />
      <main className="flex-1">
        <HrDashboard
          mode={mode}
          period1={{ label: p1Label, data: period1Data }}
          period2={{ label: p2Label, data: period2Data }}
          deltaLabel={deltaLabel}
          hrKpis={hrKpis}
          period1Full={{ label: p1Label, data: raw1 }}
          period2Full={{ label: p2Label, data: raw2 }}
        />
      </main>
    </div>
  )
}
