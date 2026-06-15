'use client'
import { useState, useEffect } from 'react'
import { fmtThb, fmtPerMl, type CogsResult } from '@/lib/cogs-calculator'

type FgRow   = { month: string; total_volume_ml: number }
type LineItem = { id: string; name: string; category: string; dept: string }

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMonth(s: string) { const [y, m] = s.split('-').map(Number); return `${MN[m-1]} ${y}` }
function mk(y: number, m: number) { return `${y}-${String(m).padStart(2,'0')}-01` }

export default function FgProductionPage() {
  const now = new Date()
  const [year,       setYear]       = useState(now.getFullYear())
  const [month,      setMonth]      = useState(now.getMonth() + 1)
  const [allFgRows,  setAllFgRows]  = useState<FgRow[]>([])
  const [volInput,   setVolInput]   = useState('')
  const [savingFg,   setSavingFg]   = useState(false)
  const [fgError,    setFgError]    = useState<string | null>(null)
  const [cogs,       setCogs]       = useState<CogsResult | null>(null)
  const [cogsLoading,setCogsLoading]= useState(false)
  const [lineItems,  setLineItems]  = useState<LineItem[]>([])
  const [selectedLI, setSelectedLI] = useState('')
  const [applying,   setApplying]   = useState(false)
  const [applyResult,setApplyResult]= useState<string | null>(null)
  const [initLoading,setInitLoading]= useState(true)

  const monthKey = mk(year, month)

  // Load all FG rows + COGS line items on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings/fg-production').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/settings/cogs/line-items').then(r => r.ok ? r.json() : []),
    ]).then(([fg, li]) => {
      setAllFgRows(fg)
      setLineItems(li)
      setInitLoading(false)
    })
  }, [])

  // When period changes: pre-fill vol input from saved data, reset COGS result
  useEffect(() => {
    const saved = allFgRows.find(r => r.month.slice(0,10) === monthKey)
    setVolInput(saved ? String(saved.total_volume_ml) : '')
    setCogs(null); setApplyResult(null); setCogsLoading(false)
  }, [monthKey, allFgRows])

  // Load COGS calc when FG volume is set
  useEffect(() => {
    const saved = allFgRows.find(r => r.month.slice(0,10) === monthKey)
    if (!saved || saved.total_volume_ml === 0) { setCogs(null); return }
    setCogsLoading(true)
    fetch(`/api/admin/settings/cogs?month=${monthKey}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setCogs(data); setCogsLoading(false) })
      .catch(() => setCogsLoading(false))
  }, [monthKey, allFgRows])

  async function handleSaveFg(e: React.FormEvent) {
    e.preventDefault()
    const vol = parseFloat(volInput)
    if (isNaN(vol) || vol <= 0) { setFgError('Enter a valid volume'); return }
    setSavingFg(true); setFgError(null)
    const res = await fetch('/api/admin/settings/fg-production', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ month: monthKey, total_volume_ml: vol }),
    })
    if (res.ok) {
      const updated = await res.json()
      const key = String(updated.month).slice(0,10)
      setAllFgRows(prev => {
        const filtered = prev.filter(r => r.month.slice(0,10) !== key)
        return [...filtered, { month: key, total_volume_ml: Number(updated.total_volume_ml) }]
          .sort((a,b) => b.month.localeCompare(a.month))
      })
    } else {
      const j = await res.json(); setFgError(j.error ?? 'Save failed')
    }
    setSavingFg(false)
  }

  async function handleDeleteFg(month: string) {
    const res = await fetch('/api/admin/settings/fg-production', {
      method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ month }),
    })
    if (res.ok) setAllFgRows(prev => prev.filter(r => r.month.slice(0,10) !== month.slice(0,10)))
  }

  async function handleApplyToPL() {
    if (!cogs || !selectedLI) return
    setApplying(true); setApplyResult(null)
    const res = await fetch('/api/admin/settings/cogs', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ month: monthKey, line_item_id: selectedLI, total_cogs: cogs.total_cogs }),
    })
    if (res.ok) {
      setApplyResult(`COGS ${fmtThb(cogs.total_cogs)} applied to ${MN[month-1]} ${year} P&L`)
    } else {
      const j = await res.json(); setApplyResult(`Error: ${j.error ?? 'failed'}`)
    }
    setApplying(false)
  }

  const savedVol = allFgRows.find(r => r.month.slice(0,10) === monthKey)?.total_volume_ml

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">FG Production</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Monthly finished-goods output volume — drives DL/ml and MOH/ml shared rates and the COGS calculator.
        </p>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">Period:</span>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          {MN.map((mn, i) => <option key={mn} value={i+1}>{mn}</option>)}
        </select>
        <input type="number" value={year} min={2020} max={2099}
          onChange={e => setYear(Number(e.target.value))}
          className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      {/* FG input */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          FG Production — {MN[month-1]} {year}
          {savedVol != null && (
            <span className="ml-2 text-xs font-normal text-emerald-600">
              ✓ saved: {savedVol.toLocaleString('en-US')} ml
            </span>
          )}
        </h3>
        <form onSubmit={handleSaveFg} className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-gray-500 mb-1">Total FG produced (ml)</label>
            <input type="number" step="0.0001" min="0"
              value={volInput} onChange={e => setVolInput(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <button type="submit" disabled={savingFg}
            className="px-4 py-2 text-sm font-medium bg-[#1e2a3a] text-white rounded-lg hover:bg-[#2d3e52] disabled:opacity-50">
            {savingFg ? 'Saving…' : 'Save'}
          </button>
        </form>
        {fgError && <p className="mt-2 text-xs text-red-500">{fgError}</p>}
      </div>

      {/* Auto-calculated rates */}
      {(cogs || cogsLoading) && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Auto-calculated Shared Rates — {MN[month-1]} {year}
          </h3>
          {cogsLoading ? (
            <p className="text-sm text-gray-400">Calculating…</p>
          ) : cogs && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Component</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Actual (฿)</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">FG qty (ml)</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Rate (฿/ml)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-4 py-2.5 font-medium text-emerald-700">DL (Direct Labor)</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtThb(cogs.dl_actual)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cogs.total_volume_ml.toLocaleString('en-US')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{fmtPerMl(cogs.dl_per_ml)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-amber-700">MOH (Manufacturing Overhead)</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtThb(cogs.moh_actual)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{cogs.total_volume_ml.toLocaleString('en-US')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-700">{fmtPerMl(cogs.moh_per_ml)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* COGS Calculator */}
      {cogs && !cogsLoading && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">
            COGS Calculator — {MN[month-1]} {year}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">SKU</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Vol (ml)</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Units Sold</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-blue-500">DM/ml</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-emerald-500">DL/ml</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-amber-500">MOH/ml</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">COGS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cogs.skus.map(s => (
                  <tr key={s.sku_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="text-sm text-gray-900">{s.sku_name}</div>
                      <div className="text-xs text-gray-400 font-mono">{s.sku_code}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{s.volume_ml.toLocaleString('en-US')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{s.units_sold.toLocaleString('en-US')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmtPerMl(s.dm_per_ml)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtPerMl(s.dl_per_ml)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">{fmtPerMl(s.moh_per_ml)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{fmtThb(s.cogs)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={6} className="px-3 py-2.5 text-sm font-bold text-gray-700">Total COGS</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-lg font-bold text-gray-900">
                    {fmtThb(cogs.total_cogs)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Apply to P&L */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Apply COGS to P&L</p>
            <p className="text-xs text-gray-400 mb-3">
              This will create a budget submission for the selected COGS line item in {MN[month-1]} {year}.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1 max-w-sm">
                <label className="block text-xs font-medium text-gray-500 mb-1">COGS line item</label>
                <select value={selectedLI} onChange={e => setSelectedLI(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">— select line item —</option>
                  {lineItems.map(li => (
                    <option key={li.id} value={li.id}>{li.name} ({li.dept})</option>
                  ))}
                </select>
              </div>
              <button onClick={handleApplyToPL} disabled={!selectedLI || applying}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {applying ? 'Applying…' : `Apply ${fmtThb(cogs.total_cogs)}`}
              </button>
            </div>
            {applyResult && (
              <p className={`mt-2 text-sm font-medium ${applyResult.startsWith('Error') ? 'text-red-500' : 'text-emerald-600'}`}>
                {applyResult}
              </p>
            )}
          </div>
        </div>
      )}

      {!cogs && !cogsLoading && savedVol == null && !initLoading && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
          Enter FG production volume above to see auto-calculated DL/MOH rates and the COGS breakdown.
        </div>
      )}

      {/* Historical FG table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">All FG Production Entries</h3>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {initLoading ? (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          ) : allFgRows.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No FG production data yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Month</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total Volume (ml)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allFgRows.map(r => (
                  <tr key={r.month}
                      className={`hover:bg-gray-50 ${r.month.slice(0,10) === monthKey ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmtMonth(r.month)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {r.total_volume_ml.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDeleteFg(r.month)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
