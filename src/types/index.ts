export type Role = 'admin' | 'ceo' | 'hr' | 'dept_head'

export type SubmissionStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface Department {
  id: string
  code: string
  full_name: string
  created_at: string
}

export interface Category {
  id: string
  department_id: string
  code: string
  name: string
  is_hr_category: boolean
  created_at: string
}

export interface LineItem {
  id: string
  category_id: string
  name: string
  subcategory_l1: string | null
  owner: string | null
  type: 'REVENUE' | 'EXPENSE'
  phase2_auto: boolean
  created_at: string
}

export interface User {
  id: string
  email: string
  role: Role
  department_id: string | null
  /** All department UUIDs from the user_departments junction table. */
  departmentIds: string[]
  full_name: string | null
  created_at: string
}

export interface BudgetSubmission {
  id: string
  line_item_id: string
  department_id: string
  user_id: string
  year: number
  month: number
  amount: number
  note: string | null
  status: SubmissionStatus
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface Actual {
  id: string
  line_item_id: string
  department_id: string
  year: number
  month: number
  amount: number
  source: string | null
  created_at: string
}

export interface Expense {
  id: string
  line_item_id: string
  submitted_by: string
  month: string
  amount: number
  description: string | null
  status: 'pending' | 'approved' | 'rejected'
  source: string
  created_at: string
}

export interface UpdateObligation {
  id: string
  department_id: string
  year: number
  month: number
  due_date: string
  completed_at: string | null
  created_at: string
}
