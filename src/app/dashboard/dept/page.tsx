import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import NavHeader from '@/components/NavHeader'
import DeptDashboard from './DeptDashboard'
import {
  getPLData, getPLDataAggregated, filterPLDataByDepartments,
  getComparisonPeriods, addAmounts, ZERO,
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

  if (user.departmentIds.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <NavHeader userName={user.full_name ?? user.email} role={user.role} />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-4">&#9888;</p>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">No Department Assigned</h2>
            <p className="text-sm text-gray-500">Contact your admin to be assigned to a department.</p>
          </div>
        </main>
      </div>
    )
  }

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

  const period1Data = filterPLDataByDepartments(raw1, user.departmentIds)
  const period2Data = filterPLDataByDepartments(raw2, user.departmentIds)

  // KPI values from period1 (their dept only)
  const allItems = period1Data.sections.flatMap(s => s.groups.flatMap(g => g.lineItems))
  const totals   = allItems.reduce(addAmounts, ZERO)

  const deptNames = [...new Set(
    period1Data.sections.flatMap(s => s.groups).map(g => g.deptFullName)
  )]
  const deptName = deptNames.join(' / ') || '—'

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
