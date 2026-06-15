'use client'
import { useState, useEffect } from 'react'

type Sku = { id: string; sku_name: string; sku_code: string; volume_ml: number | null; is_active: boolean }

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function mk(y: number, m: number) { return `${y}-${String(m).padStart(2,'0')}-01` }

export default function SalesUnitsPage() {
  const now = new Date()
  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth() + 1)
  const [skus,    setSkus]    = useState<Sku[]>([])
  const [entries, setEntries] = useState<Record<string, number>>({})
  const [saving,  setSaving]  = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const monthKey = mk(year, month)

  useEffect(() => {
    fetch('/api/admin/settings/skus')
      .then(r => r.ok ? r.json() : [])
      .then((sk: Sku[]) => setSkus(sk.filter(s => s.is_active)))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch(`/api/admin/settings/sales-units?month=${monthKey}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: {sku_id: string; units_sold: number}[]) => {
        const map: Record<string, number> = {}
        for (const d of data) map[d.sku_id] = Number(d.units_sold)
        setEntries(map)
      })
  }, [monthKey])

  async function saveEntry(skuId: string, units: number) {
    setSaving(prev => new Set(prev).add(skuId))
    await fetch('/api/admin/settings/sales-units', {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ sku_id: skuId, month: monthKey, units_sold: units }),
    })
    setSaving(prev => { const n = new Set(prev); n.delete(skuId); return n })
  }

  const totalUnits = Object.values(entries).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sales Units</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Units sold per SKU per month — used in the COGS calculator.
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Sales units will be auto-synced from the sales report in a future update.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
            {MN.map((mn, i) => <option key={mn} value={i+1}>{mn}</option>)}
          </select>
          <input type="number" value={year} min={2020} max={2099}
            onChange={e => setYear(Number(e.target.value))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {loading || skus.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {loading ? 'Loading…' : 'No active SKUs. Add SKUs in the SKU Master tab.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">SKU Name</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Vol / unit (ml)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Units Sold</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total ml Sold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skus.map(sku => {
                const units   = entries[sku.id] ?? 0
                const totalMl = sku.volume_ml != null ? units * sku.volume_ml : null
                const isSaving = saving.has(sku.id)
                return (
                  <tr key={sku.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{sku.sku_name}</div>
                      <div className="text-xs text-gray-400 font-mono">{sku.sku_code}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {sku.volume_ml != null ? `${sku.volume_ml} ml` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        key={monthKey + sku.id}
                        type="number" min="0" step="1"
                        defaultValue={units || ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          setEntries(prev => ({ ...prev, [sku.id]: v }))
                        }}
                        onBlur={async e => {
                          const v = parseFloat(e.target.value) || 0
                          setEntries(prev => ({ ...prev, [sku.id]: v }))
                          await saveEntry(sku.id, v)
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                        className={`w-28 text-right border rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                          isSaving ? 'border-amber-300 bg-amber-50' : 'border-gray-200 hover:border-gray-400'
                        }`}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {totalMl != null ? `${totalMl.toLocaleString('en-US')} ml` : '—'}
                    </td>
                  </tr>
                )
              })}
              {/* Totals row */}
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={2} className="px-4 py-2.5 text-sm font-semibold text-gray-700">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-gray-900">
                  {totalUnits.toLocaleString('en-US')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-600">
                  {skus.every(s => s.volume_ml != null)
                    ? `${skus.reduce((s, sku) => s + (entries[sku.id] ?? 0) * (sku.volume_ml ?? 0), 0).toLocaleString('en-US')} ml`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
