'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { assignDepartment, unassignDepartment } from './actions'

interface UserRow {
  id: string
  email: string
  full_name: string | null
  role: string
}

interface DeptRow {
  id: string
  code: string
  full_name: string
}

interface Assignment {
  userId: string
  departmentId: string
}

interface Props {
  users: UserRow[]
  departments: DeptRow[]
  initialAssignments: Assignment[]
}

const ROLE_BADGE: Record<string, string> = {
  admin:     'bg-indigo-100 text-indigo-700',
  ceo:       'bg-purple-100 text-purple-700',
  hr:        'bg-teal-100 text-teal-700',
  dept_head: 'bg-amber-100 text-amber-700',
}

const ALL_ROLES = ['admin', 'ceo', 'hr', 'dept_head'] as const
type Role = typeof ALL_ROLES[number]

// ── Invite Form ───────────────────────────────────────────────────────────────

function InviteForm({ departments }: { departments: DeptRow[] }) {
  const [email,         setEmail]         = useState('')
  const [role,          setRole]          = useState<Role>('dept_head')
  const [selectedDepts, setSelectedDepts] = useState<string[]>([])
  const [status,        setStatus]        = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [open,          setOpen]          = useState(false)

  function toggleDept(id: string) {
    setSelectedDepts(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setStatus(null)
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, departmentIds: selectedDepts }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Invite failed')
      setStatus({ type: 'success', msg: `Invitation sent to ${data.email}.` })
      setEmail(''); setSelectedDepts([])
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-800">Invite New User</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                value={role}
                onChange={e => { setRole(e.target.value as Role); setSelectedDepts([]) }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                {ALL_ROLES.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          {role === 'dept_head' && departments.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Departments</label>
              <div className="flex flex-wrap gap-2">
                {departments.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDept(d.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      selectedDepts.includes(d.id)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'
                    }`}
                  >
                    {d.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {status && (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              status.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {status.msg}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !email}
              className="px-4 py-2 bg-[#1e2a3a] text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-[#263548] transition-colors"
            >
              {loading ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function UserAssignments({ users, departments, initialAssignments }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [pending,     setPending]     = useState<Set<string>>(new Set())
  const [search,      setSearch]      = useState('')
  const [,            startTransition] = useTransition()

  function userDepts(userId: string): DeptRow[] {
    const ids = new Set(assignments.filter(a => a.userId === userId).map(a => a.departmentId))
    return departments.filter(d => ids.has(d.id))
  }

  function availableDepts(userId: string): DeptRow[] {
    const ids = new Set(assignments.filter(a => a.userId === userId).map(a => a.departmentId))
    return departments.filter(d => !ids.has(d.id))
  }

  function flashError(userId: string, msg: string) {
    setErrors(prev => ({ ...prev, [userId]: msg }))
    setTimeout(() => setErrors(prev => { const n = { ...prev }; delete n[userId]; return n }), 4000)
  }

  function handleAssign(userId: string, departmentId: string) {
    if (!departmentId) return
    const key = `${userId}|${departmentId}`
    if (pending.has(key)) return
    setAssignments(prev => [...prev, { userId, departmentId }])
    setPending(prev => new Set([...prev, key]))
    startTransition(async () => {
      try {
        await assignDepartment(userId, departmentId)
      } catch {
        setAssignments(prev =>
          prev.filter(a => !(a.userId === userId && a.departmentId === departmentId))
        )
        flashError(userId, 'Failed to assign department.')
      } finally {
        setPending(prev => { const n = new Set(prev); n.delete(key); return n })
      }
    })
  }

  function handleUnassign(userId: string, departmentId: string) {
    const key = `${userId}|${departmentId}`
    if (pending.has(key)) return
    setAssignments(prev =>
      prev.filter(a => !(a.userId === userId && a.departmentId === departmentId))
    )
    setPending(prev => new Set([...prev, key]))
    startTransition(async () => {
      try {
        await unassignDepartment(userId, departmentId)
      } catch {
        setAssignments(prev => [...prev, { userId, departmentId }])
        flashError(userId, 'Failed to remove department.')
      } finally {
        setPending(prev => { const n = new Set(prev); n.delete(key); return n })
      }
    })
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? users.filter(u =>
        (u.full_name ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      )
    : users

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/admin"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← P&amp;L
            </Link>
            <span className="text-gray-200">/</span>
            <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Assign departments to user accounts</p>
        </div>
        <input
          type="search"
          placeholder="Search users…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-60 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
        />
      </div>

      {/* Invite form */}
      <InviteForm departments={departments} />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Departments
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-12 text-center text-sm text-gray-400">
                  {search ? 'No users match your search.' : 'No users found.'}
                </td>
              </tr>
            )}

            {filtered.map(u => {
              const assigned  = userDepts(u.id)
              const available = availableDepts(u.id)
              const badge     = ROLE_BADGE[u.role] ?? 'bg-gray-100 text-gray-600'

              return (
                <tr key={u.id} className="hover:bg-gray-50/40 transition-colors">

                  {/* User info */}
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-sm text-gray-900 leading-snug">
                      {u.full_name ?? <span className="text-gray-400 italic">no name</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">
                      {u.email}
                    </div>
                    <span className={`mt-1.5 inline-block text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${badge}`}>
                      {u.role}
                    </span>
                    {errors[u.id] && (
                      <div className="mt-1 text-xs text-red-500">{errors[u.id]}</div>
                    )}
                  </td>

                  {/* Department chips + add select */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap items-center gap-2">

                      {assigned.map(dept => {
                        const key      = `${u.id}|${dept.id}`
                        const removing = pending.has(key)
                        return (
                          <span
                            key={dept.id}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-opacity ${
                              removing
                                ? 'opacity-40 bg-gray-50 text-gray-400 border-gray-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                          >
                            {dept.full_name}
                            <button
                              onClick={() => handleUnassign(u.id, dept.id)}
                              disabled={removing}
                              aria-label={`Remove ${dept.full_name} from ${u.full_name ?? u.email}`}
                              className="ml-0.5 text-indigo-400 hover:text-indigo-700 disabled:cursor-not-allowed leading-none text-sm"
                            >
                              ×
                            </button>
                          </span>
                        )
                      })}

                      {available.length > 0 && (
                        <select
                          value=""
                          onChange={e => handleAssign(u.id, e.target.value)}
                          aria-label={`Add department for ${u.full_name ?? u.email}`}
                          className="text-xs rounded-md border border-dashed border-gray-300 px-2 py-1 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white cursor-pointer transition-colors"
                        >
                          <option value="" disabled>+ Add dept</option>
                          {available.map(d => (
                            <option key={d.id} value={d.id}>{d.full_name}</option>
                          ))}
                        </select>
                      )}

                      {assigned.length === 0 && available.length === 0 && (
                        <span className="text-xs text-gray-300 italic">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 text-right">
        {filtered.length !== users.length
          ? `${filtered.length} of ${users.length} users`
          : `${users.length} users`
        } · {departments.length} departments
      </p>
    </div>
  )
}
