import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import HrDashboard from './HrDashboard'
import {
  getPLData, getPLDataAggregated, filterPLDataByHRCategory,
  getComparisonPeriods, addAmounts, ZERO,
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
  searchParams: Promise<{ mode?: string; category?: string }>
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

  const period1Data = filterPLDataByHRCategory(raw1)
  const period2Data = filterPLDataByHRCategory(raw2)

  // Build category summary cards from period1
  const categoryMap: Record<string, { budget: number; actual: number }> = {}
  for (const section of period1Data.sections) {
    for (const group of section.groups) {
      for (const item of group.lineItems) {
        if (!categoryMap[item.categoryName]) categoryMap[item.categoryName] = { budget: 0, actual: 0 }
        categoryMap[item.categoryName].budget += item.budget
        categoryMap[item.categoryName].actual += item.actual
      }
    }
  }

  const categorySummary = Object.entries(categoryMap).map(([name, amounts]) => ({
    categoryName: name,
    ...amounts,
  })).sort((a, b) => a.categoryName.localeCompare(b.categoryName))

  const allItems = period1Data.sections.flatMap(s => s.groups.flatMap(g => g.lineItems))
  const totals   = allItems.reduce(addAmounts, ZERO)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1">
        <HrDashboard
          mode={mode}
          period1={{ label: p1Label, data: period1Data }}
          period2={{ label: p2Label, data: period2Data }}
          deltaLabel={deltaLabel}
          categorySummary={categorySummary}
          totals={totals}
        />
      </main>
    </div>
  )
}
