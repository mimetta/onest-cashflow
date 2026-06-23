'use client'

import { useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidKey {
  lineItemId:   string
  lineItemName: string
  deptId:       string
  deptCode:     string
  deptFullName: string
  categoryName: string
}

interface Props { validKeys: ValidKey[] }

interface MonthColDef {
  monthNum:  number
  budgetCol: number   // 0-indexed CSV column for budget/goal
  actualCol: number   // 0-indexed CSV column for actual (= budgetCol + 2)
}

interface WFPreviewRow {
  lineItemName:   string
  ownerFromSheet: string
  department:     string   // inferred section context
  category:       string   // inferred category context
  budgetByMonth:  Record<number, number>
  actualByMonth:  Record<number, number>
  monthsFound:    number[]
  dbStatus:       'ok' | 'no_match'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_ABBRS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const MONTH_NAMES = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Keywords whose presence in Col B marks the row as a section/total to skip
const SKIP_KEYWORDS = [
  'revenue by channel', 'physical stores', 'online channels',
  'b2b', 'partnerships', 'regional channels',
  'total gross sales', 'net revenue', 'product category total',
  'cash flow planning', 'key driver',
]

// ── CSV parser (handles quoted fields with embedded commas) ───────────────────

function parseCsvProper(text: string): string[][] {
  const result: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const cells: string[] = []
    let i = 0
    while (i <= raw.length) {
      if (i === raw.length) { cells.push(''); break }
      if (raw[i] === '"') {
        let j = i + 1; let val = ''
        while (j < raw.length) {
          if (raw[j] === '"' && raw[j + 1] === '"') { val += '"'; j += 2 }
          else if (raw[j] === '"') { j++; break }
          else { val += raw[j]; j++ }
        }
        cells.push(val)
        if (j < raw.length && raw[j] === ',') j++
        i = j
      } else {
        const end = raw.indexOf(',', i)
        if (end === -1) { cells.push(raw.slice(i)); break }
        cells.push(raw.slice(i, end)); i = end + 1
      }
    }
    result.push(cells)
  }
  return result
}

function parseNum(s: string): number {
  // Strip currency symbols, commas, spaces, percentage signs
  const c = (s ?? '').replace(/[฿$€£,\s%]/g, '')
  const n = parseFloat(c)
  return isNaN(n) ? 0 : n
}

// ── Detect month columns from Row 2 (0-indexed: row index 2) ─────────────────

function detectMonths(rows: string[][]): MonthColDef[] {
  const headerRow = rows[2] ?? []
  const found: MonthColDef[] = []
  for (let c = 2; c < headerRow.length; c++) {
    const cell  = headerRow[c].trim().toLowerCase()
    if (!cell) continue
    // Strip non-alpha chars to get words (handles "Jan 2026", "March", "Q1/2026")
    const words = cell.replace(/[^a-z]/g, ' ').trim().split(/\s+/)
    for (const w of words) {
      if (MONTH_ABBRS[w] !== undefined) {
        found.push({ monthNum: MONTH_ABBRS[w], budgetCol: c, actualCol: c + 2 })
        break
      }
    }
  }
  return found
}

// ── Determine if a row is a section/total header (should be skipped for data) ─

function rowIsSection(colA: string, colB: string, cols: string[], monthDefs: MonthColDef[]): boolean {
  const b = colB.trim()
  if (!b) return true

  const bl = b.toLowerCase()

  // Numbered section headers: "1. PHYSICAL STORES", "2. ONLINE CHANNELS"
  if (/^\d+\./.test(b)) return true

  // Explicit skip keywords
  if (bl.startsWith('subtotal') || bl.startsWith('total')) return true
  if (bl.includes('(forecast)')) return true
  if (SKIP_KEYWORDS.some(kw => bl.includes(kw))) return true

  // Rows with no numeric data in any month column are headers/labels
  const hasNumerics = monthDefs.some(m => {
    const bv = parseNum(cols[m.budgetCol] ?? '')
    const av = parseNum(cols[m.actualCol] ?? '')
    return bv !== 0 || av !== 0
  })
  if (!hasNumerics) return true

  return false
}

// ── Main parse function ───────────────────────────────────────────────────────

function parseWideFormat(rows: string[][], monthDefs: MonthColDef[], nameSet: Set<string>): WFPreviewRow[] {
  const result: WFPreviewRow[] = []
  let currentDept     = ''
  let currentCategory = ''

  // Data rows start at index 4 (row 5 in the spec)
  for (let i = 4; i < rows.length; i++) {
    const cols = rows[i]
    const colA = (cols[0] ?? '').trim()
    const colB = (cols[1] ?? '').replace(/\*/g, '').trim()

    if (rowIsSection(colA, colB, cols, monthDefs)) {
      // Use this row to update dept/category context
      if (colB) {
        const bl = colB.toLowerCase()
        // Major section → becomes current department context
        if (/^\d+\./.test(colB) || SKIP_KEYWORDS.some(kw => bl.includes(kw))) {
          currentDept     = colB
          currentCategory = ''
        } else if (!colA) {
          // Sub-section without owner → becomes category context
          currentCategory = colB
        }
      }
      continue
    }

    // Data row
    const budgetByMonth: Record<number, number> = {}
    const actualByMonth: Record<number, number> = {}
    const monthsFound: number[] = []

    for (const m of monthDefs) {
      const budget = parseNum(cols[m.budgetCol] ?? '')
      const actual = parseNum(cols[m.actualCol] ?? '')
      if (budget !== 0 || actual !== 0) {
        budgetByMonth[m.monthNum] = budget
        actualByMonth[m.monthNum] = actual
        monthsFound.push(m.monthNum)
      }
    }

    if (monthsFound.length === 0) continue   // no data — skip

    const dbStatus: 'ok' | 'no_match' = nameSet.has(colB.toLowerCase()) ? 'ok' : 'no_match'

    result.push({
      lineItemName:   colB,
      ownerFromSheet: colA,
      department:     currentDept,
      category:       currentCategory,
      budgetByMonth,
      actualByMonth,
      monthsFound,
      dbStatus,
    })
  }

  return result
}

// ── Build name set for client-side DB status check ───────────────────────────

function buildNameSet(validKeys: ValidKey[]): Set<string> {
  return new Set(validKeys.map(k => k.lineItemName.trim().toLowerCase()))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WideFormatImporter({ validKeys }: Props) {
  const [preview,       setPreview]       = useState<WFPreviewRow[] | null>(null)
  const [monthDefs,     setMonthDefs]     = useState<MonthColDef[]>([])
  const [dragging,      setDragging]      = useState(false)
  const [year,          setYear]          = useState(new Date().getFullYear())
  const [importBudget,  setImportBudget]  = useState(true)
  const [importActual,  setImportActual]  = useState(true)
  const [updateOwners,  setUpdateOwners]  = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [status,        setStatus]        = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [showAllMatched, setShowAllMatched] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nameSet = buildNameSet(validKeys)

  function processText(text: string) {
    setStatus(null)
    const rows  = parseCsvProper(text)
    const defs  = detectMonths(rows)
    const items = parseWideFormat(rows, defs, nameSet)
    setMonthDefs(defs)
    setPreview(items)
  }

  function handleFile(file: File) {
    const r = new FileReader()
    r.onload = e => processText(e.target?.result as string)
    r.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return
    setLoading(true); setStatus(null)

    // Expand preview rows → one entry per (line item × month)
    const flatRows = preview.flatMap(r =>
      r.monthsFound.map(m => ({
        line_item_name:   r.lineItemName,
        owner_from_sheet: r.ownerFromSheet,
        department:       r.department,
        category:         r.category,
        month:            m,
        year,
        budget_amount:    r.budgetByMonth[m] ?? 0,
        actual_amount:    r.actualByMonth[m] ?? 0,
      }))
    )

    try {
      const res = await fetch('/api/admin/import/wide-format', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows: flatRows, import_budget: importBudget, import_actual: importActual, update_owners: updateOwners }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')

      const parts: string[] = []
      if (importBudget) parts.push(`${data.budget_imported} budget rows`)
      if (importActual) parts.push(`${data.actual_imported} actual rows`)
      if (updateOwners && data.owners_updated) parts.push(`${data.owners_updated} owners updated`)
      if (data.skipped)                        parts.push(`${data.skipped} skipped (no match)`)

      let msg = `Imported: ${parts.join(', ')}.`
      if (data.errors?.length) {
        msg += ` ${data.errors.length} error(s): ${data.errors.slice(0, 3).map((e: any) => e.error).join(' · ')}`
        if (data.errors.length > 3) msg += ` (+${data.errors.length - 3} more)`
      }
      setStatus({ type: 'success', msg })
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message })
    } finally {
      setLoading(false)
    }
  }

  const matched   = preview?.filter(r => r.dbStatus === 'ok')  ?? []
  const unmatched = preview?.filter(r => r.dbStatus === 'no_match') ?? []
  const deptSet   = new Set(preview?.map(r => r.department).filter(Boolean) ?? [])
  const PREVIEW_LIMIT = 50

  function downloadUnmatchedCsv() {
    const header = 'Line Item,Owner (Sheet),Detected Section'
    const rows = unmatched.map(r => [
      `"${r.lineItemName.replace(/"/g, '""')}"`,
      `"${r.ownerFromSheet.replace(/"/g, '""')}"`,
      `"${r.department.replace(/"/g, '""')}"`,
    ].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'unmatched-items.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const yearOpts = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

  return (
    <div className="space-y-5">

      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-800">
        Import from your existing P&L sheet. Upload the CSV export of your wide-format sheet and
        we&apos;ll extract Budget and Actual data for all months automatically.
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center py-10 cursor-pointer transition-colors ${
          dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
      >
        <div className="text-gray-400 text-3xl mb-2">&#8681;</div>
        <p className="text-sm text-gray-600 font-medium">Drag & drop your wide-format P&L CSV here</p>
        <p className="text-xs text-gray-400 mt-1">or click to browse · CSV export from Google Sheets or Excel</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
      </div>

      {/* Detection summary */}
      {preview !== null && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">

          {/* Detected months */}
          {monthDefs.length > 0 ? (
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detected months: </span>
              <span className="text-sm text-gray-800">
                {monthDefs.map(m => MONTH_NAMES[m.monthNum]).join(', ')}
              </span>
            </div>
          ) : (
            <p className="text-sm text-amber-600">No month columns detected — check the CSV format (expected month names in row 3).</p>
          )}

          {/* Line item summary */}
          {preview.length > 0 && (
            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                <span className="font-semibold text-gray-800">{preview.length}</span>
                <span className="text-gray-500 ml-1">line items detected</span>
              </span>
              {deptSet.size > 0 && (
                <span>
                  <span className="font-semibold text-gray-800">{deptSet.size}</span>
                  <span className="text-gray-500 ml-1">sections / departments</span>
                </span>
              )}
              <span className="text-emerald-600 font-medium">{matched.length} matched in DB</span>
              {unmatched.length > 0 && (
                <span className="text-amber-600 font-medium">{unmatched.length} not found in DB</span>
              )}
            </div>
          )}

          {preview.length === 0 && monthDefs.length > 0 && (
            <p className="text-sm text-gray-500">No data rows detected. Check that your sheet has data starting from row 5.</p>
          )}
        </div>
      )}

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

      {/* Matched items preview */}
      {preview && preview.length > 0 && (
        <div className="space-y-3">

          {/* Matched table */}
          {matched.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-gray-500 font-medium">
                  {matched.length} matched items
                  {!showAllMatched && matched.length > PREVIEW_LIMIT && ` — showing first ${PREVIEW_LIMIT}`}
                </p>
                {matched.length > PREVIEW_LIMIT && (
                  <button
                    onClick={() => setShowAllMatched(v => !v)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    {showAllMatched ? 'Show less' : `Show all ${matched.length}`}
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Line Item', 'Owner (sheet)', 'Section / Dept', 'Months Found', 'Budget', 'Actual'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(showAllMatched ? matched : matched.slice(0, PREVIEW_LIMIT)).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-800 max-w-[200px] truncate font-medium">{r.lineItemName}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.ownerFromSheet || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500 max-w-[160px] truncate text-[11px]">{r.department || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                          {r.monthsFound.map(m => MONTH_NAMES[m]).join(', ')}
                        </td>
                        <td className="px-3 py-1.5 text-gray-700 tabular-nums whitespace-nowrap">
                          {r.monthsFound.map(m =>
                            r.budgetByMonth[m] ? r.budgetByMonth[m].toLocaleString('en-US') : '—'
                          ).join(' · ')}
                        </td>
                        <td className="px-3 py-1.5 text-gray-700 tabular-nums whitespace-nowrap">
                          {r.monthsFound.map(m =>
                            r.actualByMonth[m] ? r.actualByMonth[m].toLocaleString('en-US') : '—'
                          ).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unmatched items section */}
          {unmatched.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-amber-700">
                  {unmatched.length} item{unmatched.length !== 1 ? 's' : ''} not found in DB
                </p>
                <button
                  onClick={downloadUnmatchedCsv}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
                >
                  Download Unmatched as CSV
                </button>
              </div>
              <div className="rounded-lg border border-amber-200 overflow-hidden overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-amber-50 border-b border-amber-200">
                      {['Line Item', 'Owner (Sheet)', 'Detected Section'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-amber-700 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {unmatched.map((r, i) => (
                      <tr key={i} className="bg-amber-50/40">
                        <td className="px-3 py-1.5 text-gray-800 font-medium max-w-[240px] truncate">{r.lineItemName}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.ownerFromSheet || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate text-[11px]">{r.department || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import options */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">Import options</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={importBudget} onChange={e => setImportBudget(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600" />
                Import Budget
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={importActual} onChange={e => setImportActual(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600" />
                Import Actual
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={updateOwners} onChange={e => setUpdateOwners(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600" />
                Update owners from sheet
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 whitespace-nowrap">Year:</span>
                <select value={year} onChange={e => setYear(parseInt(e.target.value))}
                  className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                  {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {updateOwners && (
              <p className="text-xs text-amber-600">
                Owner update: only line items with no existing owner will be updated.
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleImport}
                disabled={loading || matched.length === 0 || (!importBudget && !importActual)}
                className="px-5 py-2 bg-[#1e2a3a] text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-[#263548] transition-colors"
              >
                {loading ? 'Importing…' : `Import ${matched.length} matched rows × ${monthDefs.length} months`}
              </button>
              <button onClick={() => { setPreview(null); setStatus(null) }}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
