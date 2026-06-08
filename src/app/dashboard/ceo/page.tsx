import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import CeoDashboard from './CeoDashboard'
import NavHeader from '@/components/NavHeader'

export type MonthRow = {
  month: number
  revenue: number
  expenses: number
  netCash: number
}

export type DeptRow = {
  id: string
  name: string
  revenueBudget: number
  expenseBudget: number
  actual: number
}

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

export type Summary = {
  revenue: number
  expenses: number
  netCash: number
  prevRevenue: number
  prevExpenses: number
  prevNetCash: number
  hasPrev: boolean
}

export default async function CeoDashboardPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ceo') redirect('/login')

  const supabase = await createSupabaseServerClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [yearlyBudgetRes, yearlyExpensesRes, pendingRes, deptsRes] = await Promise.all([
    supabase
      .from('budget_submissions')
      .select(`
        month, amount,
        line_items (
          type,
          categories (
            departments ( id, full_name )
          )
        )
      `)
      .eq('year', year)
      .eq('status', 'approved'),

    supabase
      .from('expenses')
      .select(`
        month, amount,
        line_items (
          categories (
            departments ( id )
          )
        )
      `)
      .eq('status', 'approved')
      .gte('month', `${year}-01-01`)
      .lte('month', `${year}-12-31`),

    supabase
      .from('budget_submissions')
      .select(`
        id, year, month, amount, submitted_at,
        line_items ( name, type, categories ( name ) ),
        departments ( full_name ),
        users ( full_name, email )
      `)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),

    supabase
      .from('departments')
      .select('id, full_name')
      .order('full_name'),
  ])

  const yearlyBudget   = yearlyBudgetRes.data   ?? []
  const yearlyExpenses = yearlyExpensesRes.data  ?? []
  const pendingData    = pendingRes.data         ?? []
  const departments    = deptsRes.data           ?? []

  // ── Monthly totals + per-month per-dept budget breakdown ──────
  const monthlyRevenue:   Record<number, number> = {}
  const monthlyExpBudget: Record<number, number> = {}

  // [month][deptId] = { rev, exp }
  const deptRevByMonth: Record<number, Record<string, number>> = {}
  const deptExpByMonth: Record<number, Record<string, number>> = {}
  for (let m = 1; m <= 12; m++) {
    deptRevByMonth[m] = {}
    deptExpByMonth[m] = {}
  }

  for (const row of yearlyBudget) {
    const li   = (row as any).line_items
    const dept = li?.categories?.departments
    const type: string = li?.type ?? ''
    const m: number    = row.month

    if (type === 'REVENUE') {
      monthlyRevenue[m] = (monthlyRevenue[m] ?? 0) + Number(row.amount)
      if (dept?.id) deptRevByMonth[m][dept.id] = (deptRevByMonth[m][dept.id] ?? 0) + Number(row.amount)
    }
    if (type === 'EXPENSE') {
      monthlyExpBudget[m] = (monthlyExpBudget[m] ?? 0) + Number(row.amount)
      if (dept?.id) deptExpByMonth[m][dept.id] = (deptExpByMonth[m][dept.id] ?? 0) + Number(row.amount)
    }
  }

  // ── Monthly actual spend + per-month per-dept actual ─────────
  const monthlyNetCash: Record<number, number> = {}
  const deptActualByMonth: Record<number, Record<string, number>> = {}
  for (let m = 1; m <= 12; m++) deptActualByMonth[m] = {}

  for (const row of yearlyExpenses) {
    const m    = parseInt((row.month as string).split('-')[1], 10)
    const dept = (row as any).line_items?.categories?.departments
    monthlyNetCash[m] = (monthlyNetCash[m] ?? 0) + Number(row.amount)
    if (dept?.id) deptActualByMonth[m][dept.id] = (deptActualByMonth[m][dept.id] ?? 0) + Number(row.amount)
  }

  // ── Build output shapes ───────────────────────────────────────
  const monthlyData: MonthRow[] = Array.from({ length: 12 }, (_, i) => ({
    month:    i + 1,
    revenue:  monthlyRevenue[i + 1]   ?? 0,
    expenses: monthlyExpBudget[i + 1] ?? 0,
    netCash:  monthlyNetCash[i + 1]   ?? 0,
  }))

  const prevMonth = month > 1 ? month - 1 : null
  const summary: Summary = {
    revenue:      monthlyRevenue[month]      ?? 0,
    expenses:     monthlyExpBudget[month]    ?? 0,
    netCash:      monthlyNetCash[month]      ?? 0,
    prevRevenue:  prevMonth ? (monthlyRevenue[prevMonth]   ?? 0) : 0,
    prevExpenses: prevMonth ? (monthlyExpBudget[prevMonth] ?? 0) : 0,
    prevNetCash:  prevMonth ? (monthlyNetCash[prevMonth]   ?? 0) : 0,
    hasPrev:      prevMonth !== null,
  }

  // Build dept rows for every month
  const deptBreakdownByMonth: Record<number, DeptRow[]> = {}
  for (let m = 1; m <= 12; m++) {
    deptBreakdownByMonth[m] = departments
      .map(dept => ({
        id:            dept.id,
        name:          dept.full_name,
        revenueBudget: deptRevByMonth[m][dept.id]    ?? 0,
        expenseBudget: deptExpByMonth[m][dept.id]    ?? 0,
        actual:        deptActualByMonth[m][dept.id] ?? 0,
      }))
      .filter(d => d.revenueBudget > 0 || d.expenseBudget > 0 || d.actual > 0)
  }

  const pendingSubmissions: PendingRow[] = pendingData.map(row => {
    const r = row as any
    return {
      id:              r.id,
      departmentName:  r.departments?.full_name              ?? '—',
      categoryName:    r.line_items?.categories?.name        ?? '—',
      lineItemName:    r.line_items?.name                    ?? '—',
      lineItemType:    r.line_items?.type                    ?? 'EXPENSE',
      submittedByName: r.users?.full_name ?? r.users?.email  ?? '—',
      year:            r.year,
      month:           r.month,
      amount:          Number(r.amount),
      submittedAt:     r.submitted_at,
    }
  })

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1">
        <CeoDashboard
          year={year}
          month={month}
          summary={summary}
          monthlyData={monthlyData}
          deptBreakdownByMonth={deptBreakdownByMonth}
          pendingSubmissions={pendingSubmissions}
        />
      </main>
    </div>
  )
}
