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

export default async function CeoDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; anchor?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ceo') redirect('/login')

  const sp   = await searchParams
  const mode = sp.mode ?? '3month'

  const now    = new Date()
  const year   = now.getFullYear()
  const month  = now.getMonth() + 1
  const anchor = sp.anchor ?? `${year}-${String(month).padStart(2, '0')}`

  const supabase = await createSupabaseServerClient()

  const pendingRes = await supabase
    .from('budget_submissions')
    .select(`
      id, month, amount, submitted_at,
      line_items ( name, type, categories ( name, departments ( full_name ) ) ),
      users ( name )
    `)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  const pendingSubmissions: PendingRow[] = (pendingRes.data ?? []).map((row: any) => {
    const d      = row.month ? new Date(row.month) : null
    const yr     = d ? d.getUTCFullYear() : 0
    const mo     = d ? d.getUTCMonth() + 1 : 0
    return {
      id:              row.id,
      departmentName:  row.line_items?.categories?.departments?.full_name ?? '—',
      categoryName:    row.line_items?.categories?.name                   ?? '—',
      lineItemName:    row.line_items?.name                               ?? '—',
      lineItemType:    row.line_items?.type                               ?? 'EXPENSE',
      submittedByName: row.users?.name ?? '—',
      year: yr,
      month: mo,
      amount:          Number(row.amount),
      submittedAt:     row.submitted_at,
    }
  })

  if (mode === '3month') {
    const [ay, am] = anchor.split('-').map(Number)
    const periods3 = [shiftM(ay, am, -2), shiftM(ay, am, -1), { year: ay, month: am }]
    const monthsData = await getPLDataForMonths(periods3)
    const latestData = monthsData[monthsData.length - 1]
    const prevData   = monthsData[monthsData.length - 2]

    const revSection  = latestData.sections.find(s => s.id === 'revenue_channel')
    const grossProfit = getCalcRow(latestData, 'gross_profit')
    const opIncome    = getCalcRow(latestData, 'operating_income')
    const netIncome   = getCalcRow(latestData, 'net_income')

    const hrData1 = filterPLDataByHRCategory(latestData)
    const hrData2 = filterPLDataByHRCategory(prevData)
    const hrBudget = hrData1.sections.reduce((sum, s) => sum + s.total.budget, 0)
    const hrActual = hrData1.sections.reduce((sum, s) => sum + s.total.actual, 0)
    const revenue1 = revSection?.total.actual ?? 0

    const p3 = periods3[periods3.length - 1]
    const p2 = periods3[periods3.length - 2]
    const hrPeriod1 = { label: `${MN[p3.month - 1]} ${p3.year}`, data: hrData1 }
    const hrPeriod2 = { label: `${MN[p2.month - 1]} ${p2.year}`, data: hrData2 }

    const months: MonthColumn[] = periods3.map((p, i) => ({
      year: p.year, month: p.month,
      label: `${MN[p.month - 1]} ${p.year}`,
      data: monthsData[i],
    }))

    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <NavHeader userName={user.name ?? user.email} role={user.role} />
        <main className="flex-1">
          <CeoDashboard
            mode={mode}
            anchor={anchor}
            months={months}
            summaryCards={{
              revenue:     revenue1,
              grossProfit: grossProfit?.actual ?? 0,
              opIncome:    opIncome?.actual    ?? 0,
              netIncome:   netIncome?.actual   ?? 0,
            }}
            hrPeriod1={hrPeriod1}
            hrPeriod2={hrPeriod2}
            hrKpis={{ budget: hrBudget, actual: hrActual, revenue: revenue1 }}
            pendingSubmissions={pendingSubmissions}
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
  const hrData1     = filterPLDataByHRCategory(period1Data)
  const hrData2     = filterPLDataByHRCategory(period2Data)
  const hrBudget    = hrData1.sections.reduce((sum, s) => sum + s.total.budget, 0)
  const hrActual    = hrData1.sections.reduce((sum, s) => sum + s.total.actual, 0)
  const revenue1    = revSection?.total.actual ?? 0

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.name ?? user.email} role={user.role} />
      <main className="flex-1">
        <CeoDashboard
          mode={mode}
          anchor={anchor}
          period1={{ label: p1Label, data: period1Data }}
          period2={{ label: p2Label, data: period2Data }}
          deltaLabel={deltaLabel}
          summaryCards={{
            revenue:     revenue1,
            grossProfit: grossProfit?.actual ?? 0,
            opIncome:    opIncome?.actual    ?? 0,
            netIncome:   netIncome?.actual   ?? 0,
          }}
          hrPeriod1={{ label: p1Label, data: hrData1 }}
          hrPeriod2={{ label: p2Label, data: hrData2 }}
          hrKpis={{ budget: hrBudget, actual: hrActual, revenue: revenue1 }}
          pendingSubmissions={pendingSubmissions}
        />
      </main>
    </div>
  )
}
