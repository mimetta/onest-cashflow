'use client'
import { useState, useEffect } from 'react'

type Sku = {
  id: string
  sku_code: string
  sku_name: string
  uom: string
  is_active: boolean
  created_at: string
}

export default function SkusPage() {
  const [skus,    setSkus]    = useState<Sku[]>([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [form,    setForm]    = useState({ sku_code: '', sku_name: '', uom: 'ml' })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/settings/skus')
    if (res.ok) setSkus(await res.json())
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.sku_code.trim() || !form.sku_name.trim()) return
    setSaving(true); setError(null)
    const res = await fetch('/api/admin/settings/skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const sku = await res.json()
      setSkus(prev => [...prev, sku].sort((a, b) => a.sku_code.localeCompare(b.sku_code)))
      setForm({ sku_code: '', sku_name: '', uom: 'ml' })
      setAdding(false)
    } else {
      const j = await res.json()
      setError(j.error ?? 'Failed to add SKU')
    }
    setSaving(false)
  }

  async function toggleActive(sku: Sku) {
    const res = await fetch('/api/admin/settings/skus', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sku.id, is_active: !sku.is_active }),
    })
    if (res.ok) {
      const updated = await res.json()
      setSkus(prev => prev.map(s => s.id === sku.id ? updated : s))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SKU Master</h2>
          <p className="text-sm text-gray-400 mt-0.5">Products and finishing goods reference list</p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="px-3 py-2 text-sm font-medium bg-[#1e2a3a] text-white rounded-lg hover:bg-[#2d3e52] transition-colors"
        >
          + Add SKU
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">New SKU</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">SKU Code</label>
              <input
                value={form.sku_code}
                onChange={e => setForm(f => ({ ...f, sku_code: e.target.value }))}
                placeholder="e.g. FG-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">SKU Name</label>
              <input
                value={form.sku_name}
                onChange={e => setForm(f => ({ ...f, sku_name: e.target.value }))}
                placeholder="e.g. Product A 100ml"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Unit (UoM)</label>
              <input
                value={form.uom}
                onChange={e => setForm(f => ({ ...f, uom: e.target.value }))}
                placeholder="ml"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button" onClick={() => { setAdding(false); setError(null) }}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : skus.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No SKUs yet. Add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">UoM</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skus.map(sku => (
                <tr key={sku.id} className={`hover:bg-gray-50 ${!sku.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">{sku.sku_code}</td>
                  <td className="px-4 py-3 text-gray-900">{sku.sku_name}</td>
                  <td className="px-4 py-3 text-gray-500">{sku.uom}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      sku.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {sku.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(sku)}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                    >
                      {sku.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
