'use client'

import { useState, useMemo } from 'react'
import { PL_SECTIONS } from '@/lib/pl-structure'

interface Dept   { id: string; code: string; full_name: string }
interface Cat    { id: string; name: string; is_hr_category: boolean; department_id: string }
interface LineItem {
  id: string; name: string; type: string; is_active: boolean | null
  categories: { id: string; name: string; is_hr_category: boolean; departments: Dept | null } | null
}

interface Props {
  initialItems: LineItem[]
  departments:  Dept[]
  categories:   Cat[]
}

// Build section → group pairs from PL_SECTIONS
const SECTIONS = PL_SECTIONS.map(s => ({
  id:     s.id,
  title:  s.title,
  groups: s.groups.map(g => ({ deptCode: g.deptCode, deptFullName: g.deptFullName })),
}))

export default function LineItemsClient({ initialItems, departments, categories }: Props) {
  const [items,   setItems]   = useState<LineItem[]>(initialItems)
  const [search,  setSearch]  = useState('')
  const [toast,   setToast]   = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // ── Add form state ──────────────────────────────────────────────────────────
  const [formName,      setFormName]      = useState('')
  const [formSection,   setFormSection]   = useState('')
  const [formDeptKey,   setFormDeptKey]   = useState('')  // "code|full_name"
  const [formCatId,     setFormCatId]     = useState('')
  const [newCatMode,    setNewCatMode]    = useState(false)
  const [newCatName,    setNewCatName]    = useState('')
  const [formHr,        setFormHr]        = useState(false)
  const [submitting,    setSubmitting]    = useState(false)

  // ── Move modal state ────────────────────────────────────────────────────────
  const [moveItem,      setMoveItem]      = useState<LineItem | null>(null)
  const [moveCatId,     setMoveCatId]     = useState('')
  const [moving,        setMoving]        = useState(false)

  function flash(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  // Derive dept UUID from selected section + deptKey
  const sectionGroups = useMemo(() => {
    const sec = SECTIONS.find(s => s.id === formSection)
    if (!sec) return []
    return sec.groups.map(g => {
      const dept = departments.find(d => d.code === g.deptCode && d.full_name === g.deptFullName)
      return { key: `${g.deptCode}|${g.deptFullName}`, label: g.deptFullName, deptId: dept?.id ?? '' }
    })
  }, [formSection, departments])

  const selectedDeptId = sectionGroups.find(g => g.key === formDeptKey)?.deptId ?? ''

  const filteredCats = useMemo(
    () => categories.filter(c => c.department_id === selectedDeptId),
    [categories, selectedDeptId],
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        is_hr_category: formHr,
      }
      if (newCatMode && newCatName.trim() && selectedDeptId) {
        body.new_category_name = newCatName.trim()
        body.department_id     = selectedDeptId
      } else {
        body.category_id = formCatId
      }
      const res  = await fetch('/api/admin/line-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      flash('ok', `"${formName.trim()}" added.`)
      setFormName(''); setFormCatId(''); setNewCatName(''); setNewCatMode(false); setFormHr(false)
      // Refresh list
      const listRes = await fetch('/api/admin/line-items')
      if (listRes.ok) setItems(await listRes.json())
    } catch (err: any) {
      flash('err', err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(item: LineItem) {
    const isActive = item.is_active !== false
    const method   = isActive ? 'DELETE' : 'PATCH'
    const body     = isActive
      ? { id: item.id }
      : { id: item.id, is_active: true }
    const res = await fetch('/api/admin/line-items', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { flash('err', 'Failed'); return }
    setItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, is_active: !isActive } : i,
    ))
    flash('ok', isActive ? `"${item.name}" deactivated.` : `"${item.name}" reactivated.`)
  }

  async function handleMove() {
    if (!moveItem || !moveCatId) return
    setMoving(true)
    const res = await fetch('/api/admin/line-items', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: moveItem.id, category_id: moveCatId }),
    })
    setMoving(false)
    if (!res.ok) { flash('err', 'Move failed'); return }
    const listRes = await fetch('/api/admin/line-items')
    if (listRes.ok) setItems(await listRes.json())
    flash('ok', `"${moveItem.name}" moved.`)
    setMoveItem(null); setMoveCatId('')
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? items.filter(i => i.name.toLowerCase().includes(q)) : items
  }, [items, search])

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <h1 className="text-xl font-bold text-gray-900 mb-6">Manage Line Items</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">

        {/* ── Left: Add form ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">Add New Line Item</h2>
          <form onSubmit={handleAdd} className="space-y-3">

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                required value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Packaging"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Section</label>
              <select
                value={formSection}
                onChange={e => { setFormSection(e.target.value); setFormDeptKey(''); setFormCatId('') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="">— select section —</option>
                {SECTIONS.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>

            {formSection && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Department / Group</label>
                <select
                  value={formDeptKey}
                  onChange={e => { setFormDeptKey(e.target.value); setFormCatId('') }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value="">— select dept —</option>
                  {sectionGroups.map(g => (
                    <option key={g.key} value={g.key} disabled={!g.deptId}>
                      {g.label}{!g.deptId ? ' (not in DB)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {formDeptKey && selectedDeptId && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                {!newCatMode ? (
                  <div className="flex gap-2">
                    <select
                      value={formCatId}
                      onChange={e => setFormCatId(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    >
                      <option value="">— select category —</option>
                      {filteredCats.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setNewCatMode(true); setFormCatId('') }}
                      className="px-2 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                    >
                      + New
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      placeholder="New category name"
                      className="flex-1 border border-indigo-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => { setNewCatMode(false); setNewCatName('') }}
                      className="px-2 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox" checked={formHr} onChange={e => setFormHr(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600"
              />
              HR category
            </label>

            <button
              type="submit"
              disabled={submitting || !formName.trim() || (!formCatId && !(newCatMode && newCatName.trim()))}
              className="w-full py-2 bg-[#1e2a3a] text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-[#263548] transition-colors"
            >
              {submitting ? 'Adding…' : 'Add Line Item'}
            </button>
          </form>
        </div>

        {/* ── Right: Existing items table ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-800">
              {items.length} line items
            </h2>
            <input
              type="search" placeholder="Search by name…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-56 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">HR</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                      {search ? 'No items match.' : 'No line items yet.'}
                    </td>
                  </tr>
                )}
                {filtered.map(item => {
                  const active = item.is_active !== false
                  return (
                    <tr key={item.id} className={`hover:bg-gray-50/50 ${!active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{item.categories?.departments?.full_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{item.categories?.name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center text-xs">
                        {item.categories?.is_hr_category ? '✓' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                          active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {active && (
                            <button
                              onClick={() => { setMoveItem(item); setMoveCatId(item.categories?.id ?? '') }}
                              className="text-xs text-indigo-600 hover:underline"
                            >
                              Move
                            </button>
                          )}
                          <button
                            onClick={() => handleDeactivate(item)}
                            className={`text-xs ${active ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'} hover:underline`}
                          >
                            {active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Move modal ─────────────────────────────────────────────────────── */}
      {moveItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Move "{moveItem.name}"</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Category</label>
              <select
                value={moveCatId}
                onChange={e => setMoveCatId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="">— select —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setMoveItem(null); setMoveCatId('') }}
                className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMove}
                disabled={moving || !moveCatId}
                className="px-4 py-2 bg-[#1e2a3a] text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-[#263548]"
              >
                {moving ? 'Moving…' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
