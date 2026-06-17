'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { fmtPerMl } from '@/lib/cogs-calculator'

type Sku = { id: string; sku_name: string; sku_code: string; is_active: boolean }
type StdCostRow = {
  id: string; sku_id: string; sku_name: string; sku_code: string
  effective_month: string; dm_per_ml: number; imported_at: string
}
type ScPreviewRow = {
  sku_code?: string; sku_name: string; effective_month: string; dm_per_ml: number
  status: 'valid' | 'unknown_sku'
}
type SharedRates = {
  total_volume_ml: number; dl_actual: number; moh_actual: number
  dl_per_ml: number; moh_per_ml: number
}

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMonth(s: string) { const [y, m] = s.split('-').map(Number); return `${MN[m-1]} ${y}` }
function fmtThb(n: number) { return `฿${Math.round(n).toLocaleString('en-US')}` }
function monthKey(y: number, m: number) { return `${y}-${String(m).padStart(2,'0')}-01` }

function parseCsv(text: string): Omit<ScPreviewRow, 'status'>[] {
  const lines = text.trim().split('\n'); if (lines.length < 2) return []
  const h = lines[0].split(',').map(s => s.trim().toLowerCase())
  const ci = h.indexOf('sku_code'); const ni = h.indexOf('sku_name')
  const mi = h.indexOf('effective_month'); const di = h.indexOf('dm_per_ml')
  if (mi === -1) return []
  return lines.slice(1).map(line => {
    const c = line.split(',').map(v => v.trim())
    const row: Omit<ScPreviewRow, 'status'> = {
      sku_name: (ni !== -1 ? c[ni] : '') ?? '',
      effective_month: c[mi] ?? '',
      dm_per_ml: parseFloat(c[di] ?? '0') || 0,
    }
    if (ci !== -1 && c[ci]) row.sku_code = c[ci]
    return row
  }).filter(r => r.effective_month && (r.sku_code || r.sku_name))
}

function downloadCsv(fn: string, content: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content],{type:'text/csv'}))
  a.download = fn; a.click()
}

export default function StandardCostsPage() {
  const now = new Date()
  const [year,         setYear]         = useState(now.getFullYear())
  const [month,        setMonth]        = useState(now.getMonth() + 1)
  const [rows,         setRows]         = useState<StdCostRow[]>([])
  const [skus,         setSkus]         = useState<Sku[]>([])
  const [rates,        setRates]        = useState<SharedRates | null>(null)
  const [ratesLoading, setRatesLoading] = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [preview,      setPreview]      = useState<ScPreviewRow[] | null>(null)
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings/standard-costs').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/settings/skus').then(r => r.ok ? r.json() : []),
    ]).then(([sc, sk]) => { setRows(sc); setSkus(sk); setLoading(false) })
  }, [])

  useEffect(() => {
    setRates(null); setRatesLoading(true)
    fetch(`/api/admin/settings/cogs?month=${monthKey(year, month)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setRates({
          total_volume_ml: data.total_volume_ml,
          dl_actual: data.dl_actual, moh_actual: data.moh_actual,
          dl_per_ml: data.dl_per_ml, moh_per_ml: data.moh_per_ml,
        })
        setRatesLoading(false)
      })
      .catch(() => setRatesLoading(false))
  }, [year, month])

  const currentRows = useMemo(() => {
    const map = new Map<string, StdCostRow>()
    for (const r of rows) {
      const ex = map.get(r.sku_id)
      if (!ex || r.effective_month > ex.effective_month) map.set(r.sku_id, r)
    }
    return Array.from(map.values()).sort((a, b) => a.sku_code.localeCompare(b.sku_code))
  }, [rows])

  function historyFor(skuId: string) {
    return rows.filter(r => r.sku_id === skuId).sort((a, b) => b.effective_month.localeCompare(a.effective_month))
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/admin/settings/standard-costs', {
      method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id }),
    })
    if (res.ok) setRows(prev => prev.filter(r => r.id !== id))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCsv(ev.target?.result as string)
      const skuNameSet = new Set(skus.map(s => s.sku_name.toLowerCase()))
      const skuCodeSet = new Set(skus.map(s => s.sku_code.toLowerCase()))
      setPreview(parsed.map(r => ({
        ...r,
        status: (r.sku_code && skuCodeSet.has(r.sku_code.toLowerCase())) || skuNameSet.has(r.sku_name.toLowerCase())
          ? 'valid'
          : 'unknown_sku',
      })))
      setImportResult(null)
    }
    reader.readAsText(file); e.target.value = ''
  }

  async function handleImport() {
    if (!preview) return
    const valid = preview.filter(r => r.status === 'valid')
    if (!valid.length) return
    setImporting(true); setImportResult(null)
    const res = await fetch('/api/admin/settings/standard-costs/import', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ rows: valid }),
    })
    if (res.ok) {
      const j = await res.json()
      const skip = preview.length - valid.length + (j.skipped ?? 0)
      setImportResult(`Imported ${j.imported}${skip ? `, skipped ${skip}` : ''}`)
      setPreview(null)
      fetch('/api/admin/settings/standard-costs').then(r => r.ok ? r.json() : []).then(setRows)
    } else { setImportResult('Import failed') }
    setImporting(false)
  }

  function handleDownloadTemplate() {
    const mk = monthKey(year, month)
    const active = skus.filter(s => s.is_active)
    const dataRows = active.length
      ? active.map(s => `${s.sku_code},${s.sku_name},${mk},0.000000`).join('\n')
      : `OWB-250,Song Wat Body Wash,${mk},0.25\nTNC-100,Talat Noi Hand Cream,${mk},0.18`
    downloadCsv('standard_costs_template.csv', `sku_code,sku_name,effective_month,dm_per_ml\n${dataRows}\n`)
  }

  const mk = monthKey(year, month)
  const noFgData = rates !== null && rates.total_volume_ml === 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Standard Costs</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            DM/ml is SKU-specific (imported). DL/ml and MOH/ml are shared rates
            auto-calculated from COGM actuals ÷ FG production volume.
          </p>
          <p className="text-xs text-amber-600 mt-1.5 max-w-xl">
            Standard costs are NOT auto-calculated from COGM. They are management-set
            rates used to value inventory. Use the FG Production tab for the COGS calculator.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleDownloadTemplate}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Download Template
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <button onClick={() => fileRef.current?.click()}
            className="px-3 py-2 text-sm font-medium bg-[#1e2a3a] text-white rounded-lg hover:bg-[#2d3e52] transition-colors">
            Import DM CSV
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">View rates for:</span>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          {MN.map((mn, i) => <option key={mn} value={i+1}>{mn}</option>)}
        </select>
        <input type="number" value={year} min={2020} max={2099}
          onChange={e => setYear(Number(e.target.value))}
          className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      </div>

      {/* Shared rates cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Shared Rates — {MN[month-1]} {year}</h3>
        {noFgData && (
          <div className="mb-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">
            FG Production not entered for {MN[month-1]} {year}.{' '}
            <a href="/dashboard/admin/settings/fg-production" className="underline font-medium">
              Go to FG Production tab
            </a>{' '}
            to enter volume.
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'DL Rate', actual: rates?.dl_actual ?? 0, rate: rates?.dl_per_ml ?? 0, color: 'emerald' },
            { label: 'MOH Rate', actual: rates?.moh_actual ?? 0, rate: rates?.moh_per_ml ?? 0, color: 'amber' },
          ].map(({ label, actual, rate, color }) => (
            <div key={label} className={`bg-white border border-${color}-100 rounded-xl p-4 shadow-sm`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums text-${color}-700`}>
                {ratesLoading ? '…' : fmtPerMl(rate)}
              </p>
              <p className="text-xs text-gray-400 mt-1.5">
                {ratesLoading ? '' : (
                  rates && rates.total_volume_ml > 0
                    ? `${fmtThb(actual)} actual ÷ ${rates.total_volume_ml.toLocaleString('en-US')} ml FG`
                    : 'No FG production data'
                )}
              </p>
              <p className="text-[10px] text-gray-300 mt-0.5">Source: COGM actuals + FG Production entry</p>
            </div>
          ))}
        </div>
      </div>

      {/* CSV import preview */}
      {preview && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Import Preview — {preview.length} rows
              {preview.some(r => r.status === 'unknown_sku') && (
                <span className="ml-2 text-xs font-normal text-red-500">
                  ({preview.filter(r => r.status === 'unknown_sku').length} unknown SKU{preview.filter(r => r.status === 'unknown_sku').length !== 1 ? 's' : ''} skipped)
                </span>
              )}
            </h3>
            <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-gray-700">Discard</button>
          </div>
          <div className="overflow-x-auto max-h-56 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU Code</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Effective Month</th>
                  <th className="px-3 py-2 text-right font-semibold text-blue-500">DM/ml</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((r, i) => (
                  <tr key={i} className={r.status === 'unknown_sku' ? 'opacity-50 bg-red-50' : ''}>
                    <td className="px-3 py-1.5 font-mono text-gray-600">{r.sku_code ?? '—'}</td>
                    <td className="px-3 py-1.5 text-gray-900">{r.sku_name || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-700">{fmtMonth(r.effective_month)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">{fmtPerMl(r.dm_per_ml)}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.status === 'unknown_sku' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                      }`}>{r.status === 'unknown_sku' ? 'Unknown SKU — skip' : 'OK'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={importing || preview.every(r => r.status === 'unknown_sku')}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {importing ? 'Importing…' : `Import ${preview.filter(r => r.status === 'valid').length} valid rows`}
            </button>
            <button onClick={() => setPreview(null)}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
      {importResult && (
        <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {importResult}
        </div>
      )}

      {/* Per-SKU DM table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Per-SKU Standard Costs</h3>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : currentRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No DM costs yet. Import a CSV.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Effective</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-500 uppercase">DM / ml</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-500 uppercase">DL / ml</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-amber-500 uppercase">MOH / ml</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total / ml</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {currentRows.map(r => {
                  const dlMl   = rates?.dl_per_ml  ?? 0
                  const mohMl  = rates?.moh_per_ml ?? 0
                  const total  = r.dm_per_ml + dlMl + mohMl
                  const isOpen = expandedSkus.has(r.sku_id)
                  const hist   = historyFor(r.sku_id)
                  return (
                    <>
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{r.sku_name}</div>
                          <div className="text-xs text-gray-400 font-mono">{r.sku_code}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{fmtMonth(r.effective_month)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-blue-700 bg-blue-50/30 font-medium">{fmtPerMl(r.dm_per_ml)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700 bg-emerald-50/30">{ratesLoading ? '…' : fmtPerMl(dlMl)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700 bg-amber-50/30">{ratesLoading ? '…' : fmtPerMl(mohMl)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">{fmtPerMl(total)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {hist.length > 1 && (
                              <button onClick={() => setExpandedSkus(prev => { const n=new Set(prev); n.has(r.sku_id)?n.delete(r.sku_id):n.add(r.sku_id); return n })}
                                className="text-xs text-indigo-500 hover:text-indigo-700">
                                {isOpen ? 'Hide history' : `History (${hist.length})`}
                              </button>
                            )}
                            <button onClick={() => handleDelete(r.id)}
                              className="text-xs text-red-400 hover:text-red-600">Remove</button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && hist.slice(1).map(h => (
                        <tr key={h.id} className="border-b border-gray-100 bg-gray-50/60">
                          <td className="pl-8 pr-4 py-2 text-xs text-gray-500 italic">↳ previous</td>
                          <td className="px-4 py-2 text-xs text-gray-500">{fmtMonth(h.effective_month)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs text-blue-500">{fmtPerMl(h.dm_per_ml)}</td>
                          <td colSpan={3} className="px-4 py-2 text-xs text-gray-300 text-center">rates vary by period</td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => handleDelete(h.id)}
                              className="text-[10px] text-red-300 hover:text-red-500">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
