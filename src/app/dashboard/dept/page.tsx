import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import DeptDashboard from './DeptDashboard'
import {
  getPLData, getPLDataAggregated, filterPLDataByDepartment,
  getCalcRow, getComparisonPeriods, addAmounts, ZERO,
} from '@/lib/pl-data'
import type { PLData } from '@/lib/pl-data'

async function fetchPeriod(periods: Array<{ year: number; month: number }>): Promise<PLData> {
  return periods.length === 1
    ? getPLData(periods[0].year, periods[0].month)
    : getPLDataAggregated(periods)
}

export default async function DeptDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'dept_head') redirect('/login')
  if (!user.department_id) redirect('/login')

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

  const period1Data = filterPLDataByDepartment(raw1, user.department_id)
  const period2Data = filterPLDataByDepartment(raw2, user.department_id)

  // KPI values from period1 (their dept only)
  const allItems = period1Data.sections.flatMap(s => s.groups.flatMap(g => g.lineItems))
  const totals   = allItems.reduce(addAmounts, ZERO)

  const deptName = period1Data.sections
    .flatMap(s => s.groups)
    .find(g => true)?.deptFullName ?? '—'

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1">
        <DeptDashboard
          deptName={deptName}
          mode={mode}
          period1={{ label: p1Label, data: period1Data }}
          period2={{ label: p2Label, data: period2Data }}
          deltaLabel={deltaLabel}
          kpi={{
            totalBudget: totals.budget,
            actualSpent: totals.actual,
            variance:    totals.variance,
          }}
        />
      </main>
    </div>
  )
}
