'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import WideFormatImporter from './WideFormatImporter'

interface ValidKey {
  lineItemId:   string
  lineItemName: string
  deptId:       string
  deptCode:     string
  deptFullName: string
  categoryName: string
}

interface Props { validKeys: ValidKey[] }

interface ParsedRow {
  line: number
  raw:  string[]
  name:     string
  dept:     string
  category: string
  monthStr: string
  year:     number
  amount:   number
  // resolved
  lineItemId?:   string
  departmentId?: string
  monthNum?:     number
  error?:        string
}

const MONTH_MAP: Record<string, number> = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseCsv(text: string): string[][] {
  return text.trim().split(/\r?\n/).map(line => {
    // basic CSV parse (no quoted commas support needed here)
    return line.split(',').map(c => c.trim())
  })
}

function n(s: string) { return s.trim().toLowerCase() }

function buildLookup(validKeys: ValidKey[]): Map<string, { lineItemId: string; deptId: string }> {
  const m = new Map<string, { lineItemId: string; deptId: string }>()
  for (const k of validKeys) {
    const resolved = { lineItemId: k.lineItemId, deptId: k.deptId }
    const namePart = n(k.lineItemName)
    const catPart  = n(k.categoryName)
    // Register under both dept code and dept full_name so either matches
    m.set(`${namePart}|${n(k.deptCode)}|${catPart}`,      resolved)
    m.set(`${namePart}|${n(k.deptFullName)}|${catPart}`,  resolved)
  }
  return m
}

function parseRows(lines: string[][], lookup: Map<string, { lineItemId: string; deptId: string }>): ParsedRow[] {
  // skip header if present
  const start = lines[0]?.[0]?.toLowerCase().startsWith('line_item') ? 1 : 0
  return lines.slice(start).filter(r => r.some(c => c)).map((cols, i) => {
    const name     = cols[0] ?? ''
    const dept     = cols[1] ?? ''
    const category = cols[2] ?? ''
    const monthStr = cols[3] ?? ''
    const yearStr  = cols[4] ?? ''
    const amtStr   = cols[5] ?? ''
    const line     = start + i + 1

    const monthNum = MONTH_MAP[monthStr.toLowerCase()]
    const year     = parseInt(yearStr, 10)
    const amount   = parseFloat(amtStr)

    let error: string | undefined
    if (!name)          error = 'Missing line item name'
    else if (!dept)     error = 'Missing department'
    else if (!monthNum) error = `Unknown month "${monthStr}"`
    else if (!year || isNaN(year)) error = 'Invalid year'
    else if (isNaN(amount)) error = 'Invalid amount'

    const key     = `${n(name)}|${n(dept)}|${n(category)}`
    const matched = !error ? lookup.get(key) : undefined
    if (!error && !matched) error = `No match for "${name}" / ${dept} / ${category}`

    return {
      line, raw: cols, name, dept, category, monthStr, year, amount,
      lineItemId:   matched?.lineItemId,
      departmentId: matched?.deptId,
      monthNum,
      error,
    }
  })
}

const TEMPLATE_BUDGET =
  'line_item_name,department,category,month,year,amount\n' +
  'Example Revenue Line,SALES,Revenue Channel,Jun,2024,1000000\n'

const TEMPLATE_ACTUAL =
  'line_item_name,department,category,month,year,amount\n' +
  'Example Expense Line,OPS,Operating Expenses,Jun,2024,50000\n'

export default function ImportClient({ validKeys }: Props) {
  const [tab,      setTab]      = useState<'budget' | 'actual' | 'wide'>('budget')
  const [rows,     setRows]     = useState<ParsedRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [status,   setStatus]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [loading,  setLoading]  = useState(false)
  const fileRef  = useRef<HTMLInputElement>(null)
  const lookup   = buildLookup(validKeys)

  function loadText(text: string) {
    setStatus(null)
    setRows(parseRows(parseCsv(text), lookup))
  }

  function handleFile(file: File) {
    const r = new FileReader()
    r.onload = e => loadText(e.target?.result as string)
    r.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    const valid = rows.filter(r => !r.error)
    if (valid.length === 0) return
    setLoading(true); setStatus(null)
    try {
      const payload = {
        type: tab,
        rows: valid.map(r => ({
          name:     r.name,
          dept:     r.dept,
          category: r.category,
          month:    r.monthNum!,
          year:     r.year,
          amount:   r.amount,
        })),
      }
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      const errCount = data.errors?.length ?? 0
      if (errCount > 0) {
        const detail = (data.errors as { index: number; error: string }[])
          .slice(0, 5)
          .map(e => `row ${e.index + 1}: ${e.error}`)
          .join(' · ')
        const suffix = errCount > 5 ? ` (+${errCount - 5} more)` : ''
        throw new Error(`${data.imported} imported, ${errCount} failed — ${detail}${suffix}`)
      }
      setStatus({ type: 'success', msg: `Imported ${data.imported} rows successfully.` })
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    } finally {
      setLoading(false)
    }
  }

  function downloadTemplate() {
    const content = tab === 'budget' ? TEMPLATE_BUDGET : TEMPLATE_ACTUAL
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv' }))
    a.download = `template_${tab}.csv`
    a.click()
  }

  const validRows   = rows.filter(r => !r.error)
  const invalidRows = rows.filter(r =>  r.error)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/admin" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              ← P&amp;L
            </Link>
            <span className="text-gray-200">/</span>
            <h1 className="text-xl font-bold text-gray-900">Import Data</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Upload CSV to bulk-import budget or actual figures</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-white transition-colors"
        >
          Download template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden border border-gray-200 w-fit">
        {([
          { id: 'budget', label: 'Budget' },
          { id: 'actual', label: 'Actual' },
          { id: 'wide',   label: 'Wide Format' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setRows([]); setStatus(null) }}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-[#1e2a3a] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Wide Format tab */}
      {tab === 'wide' && <WideFormatImporter validKeys={validKeys} />}

      {/* Budget / Actual narrow-format UI */}
      {tab !== 'wide' && <>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-12 cursor-pointer transition-colors ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        <div className="text-gray-400 text-4xl mb-2">&#8681;</div>
        <p className="text-sm text-gray-600 font-medium">Drag & drop a CSV file here</p>
        <p className="text-xs text-gray-400 mt-1">or click to browse</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Format hint */}
      <p className="text-xs text-gray-400">
        CSV columns: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">line_item_name, department, category, month, year, amount</code>
        &nbsp;— month as <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">Jan</code> …
        <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">Dec</code>
      </p>

      {/* Status banner */}
      {status && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
          status.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {status.msg}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-semibold">{rows.length}</span> rows —
              <span className="text-emerald-600 font-semibold ml-1">{validRows.length} valid</span>
              {invalidRows.length > 0 && (
                <span className="text-red-500 font-semibold ml-1">{invalidRows.length} invalid</span>
              )}
            </div>
            <button
              onClick={handleImport}
              disabled={loading || validRows.length === 0}
              className="px-4 py-2 bg-[#1e2a3a] text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-[#263548] transition-colors"
            >
              {loading ? 'Importing…' : `Import ${validRows.length} rows`}
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', 'Line Item', 'Dept', 'Category', 'Month', 'Year', 'Amount', 'Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.line} className={r.error ? 'bg-red-50' : ''}>
                    <td className="px-3 py-1.5 text-gray-400">{r.line}</td>
                    <td className="px-3 py-1.5 text-gray-800 max-w-[200px] truncate">{r.name}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.dept}</td>
                    <td className="px-3 py-1.5 text-gray-600 max-w-[140px] truncate">{r.category}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.monthStr}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.year || ''}</td>
                    <td className="px-3 py-1.5 text-gray-800 tabular-nums text-right">
                      {isNaN(r.amount) ? '' : r.amount.toLocaleString('en-US')}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.error
                        ? <span className="text-red-500">{r.error}</span>
                        : <span className="text-emerald-600 font-medium">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      </>}
    </div>
  )
}
