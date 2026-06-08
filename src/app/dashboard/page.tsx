import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  switch (user.role) {
    case 'admin':     redirect('/dashboard/admin')
    case 'ceo':       redirect('/dashboard/ceo')
    case 'hr':        redirect('/dashboard/hr')
    case 'dept_head': redirect('/dashboard/dept')
    default:          redirect('/login')
  }
}
