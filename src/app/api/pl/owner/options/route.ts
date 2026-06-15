import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const DEPT_ABBR: Record<string, string> = {
  'MKT & SALES': 'MKT',
  'Retail':      'Retail',
  'G&A':         'G&A',
  'R&D':         'R&D',
  'OPS & FF':    'OPS',
  'COGM':        'Factory',
  'HR':          'HR',
  'COGS':        'Finance',
}

function abbr(code: string): string {
  return DEPT_ABBR[code] ?? code.slice(0, 3)
}

const DEPT_FALLBACKS = [
  'Marketing & Sales',
  'Retail',
  'R&D',
  'Factory',
  'G&A',
  'Stock/Warehouse',
  'Finance/Admin',
  'HR',
]

export async function GET() {
  const authClient = await createSupabaseServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = serviceClient()
  const { data: rows } = await db
    .from('users')
    .select(`id, name, user_departments ( departments ( code ) )`)
    .eq('is_active', true)
    .order('name')

  const userOptions = (rows ?? []).map((u: any) => {
    const deptCodes: string[] = (u.user_departments ?? [])
      .map((ud: any) => ud.departments?.code)
      .filter(Boolean)
    const deptAbbr = deptCodes.length > 0 ? abbr(deptCodes[0]) : null
    return deptAbbr ? `${u.name} (${deptAbbr})` : (u.name as string)
  })

  const deptOptions = DEPT_FALLBACKS.map(d => `— ${d} —`)

  return NextResponse.json([...userOptions, ...deptOptions])
}
