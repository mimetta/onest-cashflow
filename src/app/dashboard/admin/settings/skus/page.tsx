'use client'
import { useState, useEffect, useRef } from 'react'

type Sku = {
  id: string; sku_code: string; sku_name: string
  uom: string; volume_ml: number | null; is_active: boolean
}

type PreviewRow = {
  sku_code?: string; name: string; volume_ml: number
  dm_per_ml?: number; effective_month?: string
  status: 'new' | 'update'
}

const TODAY_MONTH = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

function parseCsv(text: string): Omit<PreviewRow, 'status'>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const col = (k: string) => headers.indexOf(k)
  const ci = col('sku_code'); const ni = col('sku_name'); const vi = col('volume_ml')
  const di = col('dm_per_ml'); const mi = col('effective_month')
  if (ni === -1) return []
  return lines.slice(1)
    .map(line => {
      const c = line.split(',').map(v => v.trim())
      const row: Omit<PreviewRow, 'status'> = {
        name: c[ni] ?? '', volume_ml: parseFloat(c[vi] ?? '0') || 0,
      }
      if (ci !== -1 && c[ci]) row.sku_code = c[ci]
      if (di !== -1 && c[di]) row.dm_per_ml = parseFloat(c[di]) || 0
      if (mi !== -1 && c[mi]) row.effective_month = c[mi]
      return row
    })
    .filter(r => r.name)
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function SkusPage() {
  const [skus,         setSkus]         = useState<Sku[]>([])
  const [loading,      setLoading]      = useState(true)
  const [adding,       setAdding]       = useState(false)
  const [form,         setForm]         = useState({ sku_code: '', sku_name: '', uom: 'ml' })
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)
  const [preview,      setPreview]      = useState<PreviewRow[] | null>(null)
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/settings/skus')
    if (res.ok) setSkus(await res.json())
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError(null)
    const res = await fetch('/api/admin/settings/skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const sku = await res.json()
      setSkus(prev => [...prev, sku].sort((a, b) => a.sku_code.localeCompare(b.sku_code)))
      setForm({ sku_code: '', sku_name: '', uom: 'ml' }); setAdding(false)
    } else {
      const j = await res.json(); setFormError(j.error ?? 'Failed')
    }
    setSaving(false)
  }

  async function toggleActive(sku: Sku) {
    const res = await fetch('/api/admin/settings/skus', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sku.id, is_active: !sku.is_active }),
    })
    if (res.ok) setSkus(prev => prev.map(s => s.id === sku.id ? { ...s, is_active: !s.is_active } : s))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCsv(ev.target?.result as string)
      const nameSet = new Set(skus.map(s => s.sku_name.toLowerCase()))
      setPreview(rows.map(r => ({ ...r, status: nameSet.has(r.name.toLowerCase()) ? 'update' : 'new' })))
      setImportResult(null)
    }
    reader.readAsText(file); e.target.value = ''
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true); setImportResult(null)
    const res = await fetch('/api/admin/settings/skus/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: preview.map(r => ({
          sku_code: r.sku_code, name: r.name, volume_ml: r.volume_ml,
          dm_per_ml: r.dm_per_ml, effective_month: r.effective_month,
        })),
      }),
    })
    if (res.ok) {
      const j = await res.json()
      let msg = `Created ${j.imported}, updated ${j.updated}`
      if (j.errors?.length) {
        msg += ` · ${j.errors.length} error(s)`
        if (j.errorSample?.length) msg += `:\n${(j.errorSample as string[]).join('\n')}`
      }
      setImportResult(msg)
      if (j.imported > 0 || j.updated > 0) { setPreview(null); await load() }
    } else {
      const j = await res.json().catch(() => null)
      setImportResult(`Import failed${j?.error ? `: ${j.error}` : ''}`)
    }
    setImporting(false)
  }

  function handleDownloadTemplate() {
    const active = skus.filter(s => s.is_active)
    const dataRows = active.length
      ? active.map(s => `${s.sku_code},${s.sku_name},${s.volume_ml ?? ''},0.000000,${TODAY_MONTH}`).join('\n')
      : `OWB-250,Song Wat Body Wash,250,0.25,${TODAY_MONTH}\nTNC-100,Talat Noi Hand Cream,100,0.18,${TODAY_MONTH}`
    downloadCsv('sku_import_template.csv', `sku_code,sku_name,volume_ml,dm_per_ml,effective_month\n${dataRows}\n`)
  }

  const hasDm = preview?.some(r => r.dm_per_ml !== undefined)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SKU Master</h2>
          <p className="text-sm text-gray-400 mt-0.5">Products and finished goods reference list</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownloadTemplate}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Download Template
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <button onClick={() => fileRef.current?.click()}
            className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
            Import CSV
          </button>
          <button onClick={() => setAdding(v => !v)}
            className="px-3 py-2 text-sm font-medium bg-[#1e2a3a] text-white rounded-lg hover:bg-[#2d3e52] transition-colors">
            + Add SKU
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">New SKU</h3>
          <div className="grid grid-cols-3 gap-3">
            {(['sku_code', 'sku_name', 'uom'] as const).map(f => (
              <div key={f}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {f === 'sku_code' ? 'SKU Code' : f === 'sku_name' ? 'SKU Name' : 'Unit (UoM)'}
                </label>
                <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                  placeholder={f === 'sku_code' ? 'OWB-250' : f === 'sku_name' ? 'Product A 250ml' : 'ml'}
                  required={f !== 'uom'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            ))}
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setFormError(null) }}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* CSV preview */}
      {preview && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Import Preview — {preview.length} row{preview.length !== 1 ? 's' : ''}
              {hasDm && <span className="ml-2 text-xs font-normal text-indigo-500">· includes DM/ml → will update Standard Costs</span>}
            </h3>
            <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-gray-700">Discard</button>
          </div>
          <div className="overflow-x-auto max-h-60 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU Code</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU Name</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Volume (ml)</th>
                  {hasDm && <th className="px-3 py-2 text-right font-semibold text-gray-500">DM/ml</th>}
                  {hasDm && <th className="px-3 py-2 text-left font-semibold text-gray-500">Effective Month</th>}
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-mono text-gray-600">{r.sku_code ?? <span className="text-gray-300 italic">auto</span>}</td>
                    <td className="px-3 py-1.5 text-gray-900">{r.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{r.volume_ml}</td>
                    {hasDm && <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">{r.dm_per_ml ?? '—'}</td>}
                    {hasDm && <td className="px-3 py-1.5 text-gray-600">{r.effective_month ?? '—'}</td>}
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.status === 'update' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>{r.status === 'update' ? 'Update' : 'New'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button onClick={handleImport} disabled={importing}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {importing ? 'Importing…' : `Import ${preview.length} rows`}
            </button>
            <button onClick={() => setPreview(null)}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {importResult && (
        <div className={`px-4 py-3 rounded-lg border text-sm whitespace-pre-wrap ${
          importResult.includes('error') || importResult.includes('failed')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {importResult}
        </div>
      )}

      {/* SKU table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : skus.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No SKUs yet. Add one or import a CSV.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">SKU Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">SKU Name</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Volume (ml)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">UoM</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skus.map(sku => (
                <tr key={sku.id} className={`hover:bg-gray-50 ${!sku.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{sku.sku_code}</td>
                  <td className="px-4 py-3 text-gray-900">{sku.sku_name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {sku.volume_ml != null ? sku.volume_ml.toLocaleString('en-US') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{sku.uom}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      sku.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>{sku.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => toggleActive(sku)}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
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
