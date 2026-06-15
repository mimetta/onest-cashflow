'use client'
import { useState, useEffect, useRef, useMemo } from 'react'

type Sku = { id: string; sku_name: string; sku_code: string; is_active: boolean }

type StdCostRow = {
  id:              string
  sku_id:          string
  sku_name:        string
  sku_code:        string
  effective_month: string
  dm_per_ml:       number
  dl_per_ml:       number
  moh_per_ml:      number
  updated_at:      string
}

type ScPreviewRow = {
  sku_name:        string
  effective_month: string
  dm_per_ml:       number
  dl_per_ml:       number
  moh_per_ml:      number
  status:          'valid' | 'unknown_sku'
}

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtMonth(s: string) {
  const [y, m] = s.split('-').map(Number)
  return `${MN[m - 1]} ${y}`
}
function fmtPerMl(n: number) {
  return `฿${n.toFixed(4)}/ml`
}

function parseCsv(text: string): Omit<ScPreviewRow, 'status'>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const idx = (k: string) => headers.indexOf(k)
  const ni = idx('sku_name'); const mi = idx('effective_month')
  const di = idx('dm_per_ml'); const li = idx('dl_per_ml'); const oi = idx('moh_per_ml')
  if (ni === -1 || mi === -1) return []
  return lines.slice(1)
    .map(line => {
      const c = line.split(',').map(v => v.trim())
      return {
        sku_name:        c[ni] ?? '',
        effective_month: c[mi] ?? '',
        dm_per_ml:       parseFloat(c[di] ?? '0') || 0,
        dl_per_ml:       parseFloat(c[li] ?? '0') || 0,
        moh_per_ml:      parseFloat(c[oi] ?? '0') || 0,
      }
    })
    .filter(r => r.sku_name && r.effective_month)
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function StandardCostsPage() {
  const [rows,         setRows]         = useState<StdCostRow[]>([])
  const [skus,         setSkus]         = useState<Sku[]>([])
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

  // Latest cost per SKU (client-side)
  const currentRows = useMemo(() => {
    const map = new Map<string, StdCostRow>()
    for (const r of rows) {
      const ex = map.get(r.sku_id)
      if (!ex || r.effective_month > ex.effective_month) map.set(r.sku_id, r)
    }
    return Array.from(map.values()).sort((a, b) => a.sku_name.localeCompare(b.sku_name))
  }, [rows])

  function historyFor(skuId: string): StdCostRow[] {
    return rows.filter(r => r.sku_id === skuId)
      .sort((a, b) => b.effective_month.localeCompare(a.effective_month))
  }

  function toggleHistory(skuId: string) {
    setExpandedSkus(prev => {
      const next = new Set(prev)
      next.has(skuId) ? next.delete(skuId) : next.add(skuId)
      return next
    })
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/admin/settings/standard-costs', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setRows(prev => prev.filter(r => r.id !== id))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseCsv(ev.target?.result as string)
      const skuNameSet = new Set(skus.map(s => s.sku_name.toLowerCase()))
      const pv: ScPreviewRow[] = parsed.map(r => ({
        ...r,
        status: skuNameSet.has(r.sku_name.toLowerCase()) ? 'valid' : 'unknown_sku',
      }))
      setPreview(pv)
      setImportResult(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    if (!preview) return
    const validRows = preview.filter(r => r.status === 'valid')
    if (validRows.length === 0) return
    setImporting(true); setImportResult(null)
    const res = await fetch('/api/admin/settings/standard-costs/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: validRows }),
    })
    if (res.ok) {
      const j = await res.json()
      const skipped = preview.length - validRows.length + (j.skipped ?? 0)
      setImportResult(`Imported ${j.imported}${skipped ? `, skipped ${skipped}` : ''}${j.errors?.length ? ` · ${j.errors.length} error(s)` : ''}`)
      setPreview(null)
      const updated = await fetch('/api/admin/settings/standard-costs')
      if (updated.ok) setRows(await updated.json())
    } else {
      setImportResult('Import failed')
    }
    setImporting(false)
  }

  function handleDownloadTemplate() {
    const activeSkus = skus.filter(s => s.is_active)
    const today = new Date()
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const header = 'sku_name,effective_month,dm_per_ml,dl_per_ml,moh_per_ml'
    const sample = activeSkus.length > 0
      ? activeSkus.map(s => `${s.sku_name},${month},0.0000,0.0000,0.0000`).join('\n')
      : 'Song Wat Body Wash,2026-06-01,0.12,0.05,0.08\nTalat Noi Hand Cream,2026-06-01,0.09,0.04,0.06'
    downloadCsv('standard_costs_template.csv', `${header}\n${sample}\n`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Standard Costs</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Standard costs are set by management and updated when cost structure changes
            (monthly or quarterly). Import a CSV to update all SKUs at once.
          </p>
          <p className="text-xs text-amber-600 mt-2 max-w-xl">
            Standard costs are NOT auto-calculated from COGM. They are management-set rates
            used to value inventory and calculate COGS. Use the FG Production tab to see
            how actuals compare to standard.
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
            Import CSV
          </button>
        </div>
      </div>

      {/* CSV preview panel */}
      {preview && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Import Preview — {preview.length} row{preview.length !== 1 ? 's' : ''}
              {preview.some(r => r.status === 'unknown_sku') && (
                <span className="ml-2 text-xs font-normal text-red-500">
                  ({preview.filter(r => r.status === 'unknown_sku').length} unknown SKU{preview.filter(r => r.status === 'unknown_sku').length !== 1 ? 's' : ''} will be skipped)
                </span>
              )}
            </h3>
            <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-gray-700">
              Discard
            </button>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Effective Month</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">DM/ml</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">DL/ml</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">MOH/ml</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Total/ml</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((r, i) => {
                  const total = r.dm_per_ml + r.dl_per_ml + r.moh_per_ml
                  return (
                    <tr key={i} className={r.status === 'unknown_sku' ? 'opacity-50 bg-red-50' : ''}>
                      <td className="px-3 py-1.5 text-gray-900">{r.sku_name}</td>
                      <td className="px-3 py-1.5 text-gray-700">{fmtMonth(r.effective_month)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtPerMl(r.dm_per_ml)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtPerMl(r.dl_per_ml)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtPerMl(r.moh_per_ml)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmtPerMl(total)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === 'unknown_sku'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {r.status === 'unknown_sku' ? 'Unknown SKU — skip' : 'OK'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
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

      {/* Current standard costs table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : currentRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No standard costs yet. Import a CSV to get started.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Effective</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">DM / ml</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">DL / ml</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">MOH / ml</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total / ml</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {currentRows.map(r => {
                const total     = r.dm_per_ml + r.dl_per_ml + r.moh_per_ml
                const isOpen    = expandedSkus.has(r.sku_id)
                const history   = historyFor(r.sku_id)
                const hasHistory = history.length > 1
                return (
                  <>
                    {/* Current row */}
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{r.sku_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{r.sku_code}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmtMonth(r.effective_month)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtPerMl(r.dm_per_ml)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtPerMl(r.dl_per_ml)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtPerMl(r.moh_per_ml)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{fmtPerMl(total)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {hasHistory && (
                            <button onClick={() => toggleHistory(r.sku_id)}
                              className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
                              {isOpen ? 'Hide history' : `History (${history.length})`}
                            </button>
                          )}
                          <button onClick={() => handleDelete(r.id)}
                            className="text-xs text-red-400 hover:text-red-600 transition-colors">
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* History rows */}
                    {isOpen && history.slice(1).map(h => {
                      const ht = h.dm_per_ml + h.dl_per_ml + h.moh_per_ml
                      return (
                        <tr key={h.id} className="border-b border-gray-100 bg-gray-50/60">
                          <td className="pl-8 pr-4 py-2">
                            <div className="text-xs text-gray-500 italic">↳ previous</div>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">{fmtMonth(h.effective_month)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-400">{fmtPerMl(h.dm_per_ml)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-400">{fmtPerMl(h.dl_per_ml)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-400">{fmtPerMl(h.moh_per_ml)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs text-gray-500">{fmtPerMl(ht)}</td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => handleDelete(h.id)}
                              className="text-[10px] text-red-300 hover:text-red-500 transition-colors">
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
