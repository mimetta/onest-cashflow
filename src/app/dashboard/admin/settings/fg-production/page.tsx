'use client'
import { useState, useEffect } from 'react'
import { calculateCogs, fmtThb, type FgProductionRow, type StandardCostRow } from '@/lib/cogs-calculator'

type FgRow = {
  month:           string
  total_volume_ml: number
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

export default function FgProductionPage() {
  const [rows,        setRows]        = useState<FgRow[]>([])
  const [stdCosts,    setStdCosts]    = useState<StandardCostRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [adding,      setAdding]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [showCalc,    setShowCalc]    = useState(false)
  const [form, setForm] = useState({
    year:            CURRENT_YEAR,
    month:           CURRENT_MONTH,
    total_volume_ml: '',
    notes:           '',
  })

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings/fg-production').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/settings/standard-costs').then(r => r.ok ? r.json() : []),
    ]).then(([fg, sc]) => {
      setRows(fg)
      setStdCosts(sc)
      setLoading(false)
    })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const vol = parseFloat(form.total_volume_ml)
    if (isNaN(vol) || vol <= 0) { setError('Enter a valid volume'); return }
    setSaving(true); setError(null)
    const res = await fetch('/api/admin/settings/fg-production', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: monthKey(form.year, form.month), total_volume_ml: vol }),
    })
    if (res.ok) {
      const updated = await res.json()
      const key = String(updated.month).slice(0, 10)
      setRows(prev => {
        const filtered = prev.filter(r => r.month.slice(0, 10) !== key)
        return [...filtered, { month: key, total_volume_ml: updated.total_volume_ml }]
          .sort((a, b) => b.month.localeCompare(a.month))
      })
      setAdding(false)
      setForm(f => ({ ...f, total_volume_ml: '', notes: '' }))
    } else {
      const j = await res.json()
      setError(j.error ?? 'Save failed')
    }
    setSaving(false)
  }

  async function handleDelete(month: string) {
    const res = await fetch('/api/admin/settings/fg-production', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month }),
    })
    if (res.ok) setRows(prev => prev.filter(r => r.month.slice(0, 10) !== month.slice(0, 10)))
  }

  const cogsCalc = calculateCogs(stdCosts, rows)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">FG Production</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Monthly finished-goods output volume — drives the Standard Cost/ml in the COGM schedule
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCalc(v => !v)}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {showCalc ? 'Hide' : 'Show'} COGS Calc
          </button>
          <button
            onClick={() => setAdding(v => !v)}
            className="px-3 py-2 text-sm font-medium bg-[#1e2a3a] text-white rounded-lg hover:bg-[#2d3e52] transition-colors"
          >
            + Add / Update
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">FG Production Entry</h3>
          <div className="grid grid-cols-3 gap-3">
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
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Total Volume (ml)</label>
              <input
                type="number" step="0.0001" min="0"
                value={form.total_volume_ml}
                onChange={e => setForm(f => ({ ...f, total_volume_ml: e.target.value }))}
                placeholder="e.g. 150000"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
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

      {/* COGS Calculation Panel */}
      {showCalc && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-800 mb-3">
            Implied COGS from Standard Costs × FG Volume
          </h3>
          {cogsCalc.length === 0 ? (
            <p className="text-sm text-amber-600">
              No overlap between FG production data and standard cost entries. Add standard costs in the Standard Costs tab.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200">
                  <th className="py-2 text-left text-xs font-semibold text-amber-700">Month</th>
                  <th className="py-2 text-right text-xs font-semibold text-amber-700">Volume (ml)</th>
                  <th className="py-2 text-right text-xs font-semibold text-amber-700">DM</th>
                  <th className="py-2 text-right text-xs font-semibold text-amber-700">DL</th>
                  <th className="py-2 text-right text-xs font-semibold text-amber-700">MOH</th>
                  <th className="py-2 text-right text-xs font-semibold text-amber-700">Total COGM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {cogsCalc.map(r => (
                  <tr key={r.month}>
                    <td className="py-2 text-amber-900 font-medium">{fmtMonth(r.month)}</td>
                    <td className="py-2 text-right tabular-nums text-amber-800">{r.volume.toLocaleString('en-US')}</td>
                    <td className="py-2 text-right tabular-nums text-amber-800">{fmtThb(r.dm)}</td>
                    <td className="py-2 text-right tabular-nums text-amber-800">{fmtThb(r.dl)}</td>
                    <td className="py-2 text-right tabular-nums text-amber-800">{fmtThb(r.moh)}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-amber-900">{fmtThb(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* FG Production Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No FG production data yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Volume (ml)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.month} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtMonth(r.month)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    {r.total_volume_ml.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(r.month)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors">
                      Remove
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
