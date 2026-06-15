export type StandardCostRow = {
  month: string       // 'YYYY-MM-DD'
  dm_per_ml: number
  dl_per_ml: number
  moh_per_ml: number
}

export type FgProductionRow = {
  month: string       // 'YYYY-MM-DD'
  total_volume_ml: number
}

export type CogsResult = {
  month:  string
  dm:     number
  dl:     number
  moh:    number
  total:  number
  volume: number
}

/**
 * For each month that has both standard cost and FG production data,
 * returns computed COGS amounts (DM, DL, MOH, total) in THB.
 */
export function calculateCogs(
  costs: StandardCostRow[],
  production: FgProductionRow[],
): CogsResult[] {
  const costMap: Record<string, StandardCostRow> = {}
  for (const c of costs) costMap[c.month.slice(0, 10)] = c

  const results: CogsResult[] = []
  for (const p of production) {
    const month = p.month.slice(0, 10)
    const cost  = costMap[month]
    if (!cost || p.total_volume_ml === 0) continue

    const v   = p.total_volume_ml
    const dm  = v * cost.dm_per_ml
    const dl  = v * cost.dl_per_ml
    const moh = v * cost.moh_per_ml
    results.push({ month, dm, dl, moh, total: dm + dl + moh, volume: v })
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
