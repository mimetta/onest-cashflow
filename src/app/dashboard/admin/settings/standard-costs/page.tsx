'use client'
import { useState, useEffect, useRef } from 'react'
import { fmtPerMl } from '@/lib/cogs-calculator'

type StdCostRow = {
  id:         string
  month:      string
  dm_per_ml:  number
  dl_per_ml:  number
  moh_per_ml: number
  updated_at: string
}

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMonth(s: string) {
  const [y, m] = s.split('-').map(Number)
  return `${MN[m - 1]} ${y}`
}

const CURRENT_YEAR  = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}-01`
}

export default function StandardCostsPage() {
  const [rows,    setRows]    = useState<StdCostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [form, setForm] = useState({
    year:       CURRENT_YEAR,
    month:      CURRENT_MONTH,
    dm_per_ml:  '',
    dl_per_ml:  '',
    moh_per_ml: '',
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/settings/standard-costs')
    if (res.ok) setRows(await res.json())
    setLoading(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null)
    const res = await fetch('/api/admin/settings/standard-costs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month:      monthKey(form.year, form.month),
        dm_per_ml:  parseFloat(form.dm_per_ml)  || 0,
        dl_per_ml:  parseFloat(form.dl_per_ml)  || 0,
        moh_per_ml: parseFloat(form.moh_per_ml) || 0,
      }),
    })
    if (res.ok) {
      await load()
      setAdding(false)
      setForm(f => ({ ...f, dm_per_ml: '', dl_per_ml: '', moh_per_ml: '' }))
    } else {
      const j = await res.json()
      setError(j.error ?? 'Save failed')
    }
    setSaving(false)
  }

  async function handleDelete(month: string) {
    const res = await fetch('/api/admin/settings/standard-costs', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month }),
    })
    if (res.ok) setRows(prev => prev.filter(r => r.month.slice(0, 10) !== month.slice(0, 10)))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Standard Costs</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Cost per ml by DM / DL / MOH — used to compute Standard Cost/ml in the COGM schedule
          </p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="px-3 py-2 text-sm font-medium bg-[#1e2a3a] text-white rounded-lg hover:bg-[#2d3e52] transition-colors"
        >
          + Add / Update
        </button>
      </div>

      {adding && (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Standard Cost Entry</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
              <input
                type="number" value={form.year} min={2020} max={2099}
                onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
              <select
                value={form.month}
                onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {MN.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
              </select>
            </div>
            {(['dm_per_ml', 'dl_per_ml', 'moh_per_ml'] as const).map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {field === 'dm_per_ml' ? 'DM ฿/ml' : field === 'dl_per_ml' ? 'DL ฿/ml' : 'MOH ฿/ml'}
                </label>
                <input
                  type="number" step="0.000001" min="0"
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder="0.000000"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            ))}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null) }}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No standard costs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">DM / ml</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">DL / ml</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">MOH / ml</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total / ml</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => {
                const total = r.dm_per_ml + r.dl_per_ml + r.moh_per_ml
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtMonth(r.month)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtPerMl(r.dm_per_ml)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtPerMl(r.dl_per_ml)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtPerMl(r.moh_per_ml)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{fmtPerMl(total)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(r.month)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
