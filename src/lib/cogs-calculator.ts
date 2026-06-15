export type SkuStandardCostRow = {
  sku_id:          string
  sku_name:        string
  effective_month: string  // 'YYYY-MM-DD'
  dm_per_ml:       number
  dl_per_ml:       number
  moh_per_ml:      number
}

export type FgProductionRow = {
  month:           string  // 'YYYY-MM-DD'
  total_volume_ml: number
}

export type CogsResult = {
  month:  string
  dm:     number
  dl:     number
  moh:    number
  total:  number
  volume: number
  /** Weighted-average cost/ml across all SKUs for this month */
  avg_cost_per_ml: number
}

/**
 * For each month that has FG production data, find the applicable standard costs
 * (latest effective_month <= production month), compute a simple average cost/ml
 * across all SKUs, then multiply by total production volume.
 */
export function calculateCogs(
  costs: SkuStandardCostRow[],
  production: FgProductionRow[],
): CogsResult[] {
  const results: CogsResult[] = []

  for (const p of production) {
    const month = p.month.slice(0, 10)

    // Latest applicable cost per SKU (effective_month <= production month)
    const applicable = new Map<string, SkuStandardCostRow>()
    for (const c of costs) {
      if (c.effective_month.slice(0, 10) > month) continue
      const ex = applicable.get(c.sku_id)
      if (!ex || c.effective_month > ex.effective_month) applicable.set(c.sku_id, c)
    }

    if (applicable.size === 0 || p.total_volume_ml === 0) continue

    // Simple average across SKUs (equal weight — for weighted need per-SKU volumes)
    const arr = Array.from(applicable.values())
    const avgDm  = arr.reduce((s, c) => s + c.dm_per_ml,  0) / arr.length
    const avgDl  = arr.reduce((s, c) => s + c.dl_per_ml,  0) / arr.length
    const avgMoh = arr.reduce((s, c) => s + c.moh_per_ml, 0) / arr.length
    const avgTotal = avgDm + avgDl + avgMoh

    const v = p.total_volume_ml
    results.push({
      month,
      dm:              v * avgDm,
      dl:              v * avgDl,
      moh:             v * avgMoh,
      total:           v * avgTotal,
      volume:          v,
      avg_cost_per_ml: avgTotal,
    })
  }

  return results.sort((a, b) => a.month.localeCompare(b.month))
}

/** Format a per-ml cost with 4 decimal places */
export function fmtPerMl(n: number): string {
  return `฿${n.toFixed(4)}/ml`
}

/** Format THB amount with thousands separator */
export function fmtThb(n: number): string {
  return `฿${Math.round(n).toLocaleString('en-US')}`
}
