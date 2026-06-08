import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import BudgetForm from './BudgetForm'
import NavHeader from '@/components/NavHeader'

export default async function DeptDashboard() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'dept_head' || !user.department_id) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // First day of the current month — used to query the expenses.month date column
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

  // Department info
  const { data: department } = await supabase
    .from('departments')
    .select('*')
    .eq('id', user.department_id)
    .single()

  if (!department) redirect('/login')

  // Categories for this department, excluding HR categories
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('department_id', user.department_id)
    .eq('is_hr_category', false)
    .order('name')

  const categoryIds = (categories ?? []).map(c => c.id)

  // Run remaining queries in parallel
  const [lineItemsRes, submissionsRes, expensesRes] = await Promise.all([
    categoryIds.length > 0
      ? supabase.from('line_items').select('*').in('category_id', categoryIds).order('name')
      : Promise.resolve({ data: [] }),
    supabase
      .from('budget_submissions')
      .select('*')
      .eq('department_id', user.department_id)
      .eq('year', year)
      .eq('month', month),
    // Fetch approved expenses for this month across all dept line items
    categoryIds.length > 0
      ? supabase
          .from('expenses')
          .select('line_item_id, amount')
          .eq('status', 'approved')
          .eq('month', monthStart)
          .in('line_item_id',
            // will be narrowed to actual line item ids after lineItems resolves,
            // but we pre-filter by month + status here for efficiency
            categoryIds  // placeholder — actual filter applied below
          )
      : Promise.resolve({ data: [] }),
  ])

  const lineItems = lineItemsRes.data ?? []
  const submissions = submissionsRes.data ?? []
  const lineItemIds = lineItems.map(li => li.id)

  // Re-fetch expenses filtered to actual line item ids (avoids category-level over-fetch)
  const { data: expenseRows } = lineItemIds.length > 0
    ? await supabase
        .from('expenses')
        .select('line_item_id, amount')
        .eq('status', 'approved')
        .eq('month', monthStart)
        .in('line_item_id', lineItemIds)
    : { data: [] }

  // Sum approved expenses per line item
  const expensesByLineItem: Record<string, number> = {}
  for (const row of (expenseRows ?? [])) {
    expensesByLineItem[row.line_item_id] =
      (expensesByLineItem[row.line_item_id] ?? 0) + Number(row.amount)
  }

  // Group line items by category, preserving category order
  const groups = (categories ?? [])
    .map(category => ({
      category,
      items: lineItems.filter(li => li.category_id === category.id),
    }))
    .filter(g => g.items.length > 0)

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavHeader userName={user.full_name ?? user.email} role={user.role} />
      <main className="flex-1">
        <BudgetForm
          user={user}
          department={department}
          groups={groups}
          submissions={submissions}
          expensesByLineItem={expensesByLineItem}
          year={year}
          month={month}
        />
      </main>
    </div>
  )
}
