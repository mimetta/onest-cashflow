'use client'
import { useState, useEffect, useRef } from 'react'

type Sku = {
  id: string
  sku_code: string
  sku_name: string
  uom: string
  volume_ml: number | null
  is_active: boolean
  created_at: string
}

type PreviewRow = { name: string; volume_ml: number; status: 'new' | 'update' }

function parseCsv(text: string): { name: string; volume_ml: number }[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const ni = headers.indexOf('sku_name')
  const vi = headers.indexOf('volume_ml')
  if (ni === -1) return []
  return lines.slice(1)
    .map(line => {
      const cols = line.split(',').map(c => c.trim())
      return { name: cols[ni] ?? '', volume_ml: parseFloat(cols[vi] ?? '0') || 0 }
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
    if (!form.sku_code.trim() || !form.sku_name.trim()) return
    setSaving(true); setFormError(null)
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
      setFormError(j.error ?? 'Failed to add SKU')
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCsv(ev.target?.result as string)
      const nameSet = new Set(skus.map(s => s.sku_name.toLowerCase()))
      const preview: PreviewRow[] = rows.map(r => ({
        name:      r.name,
        volume_ml: r.volume_ml,
        status:    nameSet.has(r.name.toLowerCase()) ? 'update' : 'new',
      }))
      setPreview(preview)
      setImportResult(null)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true); setImportResult(null)
    const res = await fetch('/api/admin/settings/skus/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: preview.map(r => ({ name: r.name, volume_ml: r.volume_ml })) }),
    })
    if (res.ok) {
      const j = await res.json()
      setImportResult(`Imported ${j.imported} new, updated ${j.updated}${j.errors?.length ? ` · ${j.errors.length} error(s)` : ''}`)
      setPreview(null)
      await load()
    } else {
      setImportResult('Import failed')
    }
    setImporting(false)
  }

  function handleDownloadTemplate() {
    downloadCsv('sku_template.csv', 'sku_name,volume_ml\nSong Wat Body Wash,250\nTalat Noi Hand Cream,100\n')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Manual add form */}
      {adding && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">New SKU</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">SKU Code</label>
              <input value={form.sku_code} onChange={e => setForm(f => ({ ...f, sku_code: e.target.value }))}
                placeholder="e.g. FG-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">SKU Name</label>
              <input value={form.sku_name} onChange={e => setForm(f => ({ ...f, sku_name: e.target.value }))}
                placeholder="e.g. Product A 250ml"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Unit (UoM)</label>
              <input value={form.uom} onChange={e => setForm(f => ({ ...f, uom: e.target.value }))}
                placeholder="ml"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
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

      {/* CSV import preview */}
      {preview && (
        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Import Preview — {preview.length} row{preview.length !== 1 ? 's' : ''}
            </h3>
            <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:text-gray-700">
              Discard
            </button>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU Name</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-500">Volume (ml)</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-900">{r.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{r.volume_ml}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.status === 'update' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {r.status === 'update' ? 'Update existing' : 'New'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
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
        <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Volume (ml)</th>
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
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {sku.volume_ml != null ? sku.volume_ml.toLocaleString('en-US') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{sku.uom}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      sku.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {sku.is_active ? 'Active' : 'Inactive'}
                    </span>
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
