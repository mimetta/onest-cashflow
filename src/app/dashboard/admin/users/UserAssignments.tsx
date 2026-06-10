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
