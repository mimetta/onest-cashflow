/**
 * P&L hierarchy — single source of truth for section/group ordering across all dashboards.
 *
 * Each PLGroup maps to one (deptCode, deptFullName) pair in the departments table.
 * The unique identifier is the combination of both fields (as seeded with the
 * ON CONFLICT (code, full_name) constraint).
 *
 * PLCalculatedRow terms may reference either a section's totalId OR another
 * calculated row's id — pl-data.ts resolves both from the same lookup map.
 */

// ── Core types ────────────────────────────────────────────────────────────────

export type PLGroup = {
  readonly deptCode: string       // departments.code
  readonly deptFullName: string   // departments.full_name
  readonly subtotalLabel: string
  readonly defaultOwnerName?: string | null  // shown when departments.owner_name is null
}

export type PLSection = {
  readonly id: string
  readonly title: string
  readonly groups: readonly PLGroup[]
  readonly totalLabel: string
  readonly totalId: string        // used by PLCalculatedRow.terms to reference this total
  readonly note?: string
  readonly defaultCollapsed: true  // all sections start collapsed in PLTable
  readonly hideOwner?: boolean    // suppresses editable owner cells for all rows in this section
}

export type PLCalculatedRow = {
  readonly id: string
  readonly label: string
  readonly afterSectionId: string  // rendered immediately after this section
  readonly terms: readonly {
    readonly sectionTotalId: string  // resolves against both section totalIds and prior calc row ids
    readonly sign: 1 | -1
  }[]
}

// ── Sections ──────────────────────────────────────────────────────────────────

export const PL_SECTIONS: readonly PLSection[] = [
  // ── 1. Revenue by Channel ──────────────────────────────────────────────────
  {
    id:         'revenue_channel',
    title:      'SECTION 1 — REVENUE BY CHANNEL',
    totalLabel: 'TOTAL GROSS SALES',
    totalId:    'total_gross_sales',
    defaultCollapsed: true,
    hideOwner:  true,
    groups: [
      {
        deptCode:     'Revenue by Channel',
        deptFullName: 'PHYSICAL STOERS',
        subtotalLabel: 'PHYSICAL STOERS subtotal',
      },
      {
        deptCode:     'Revenue by Channel',
        deptFullName: 'ONLINE CHANNELS',
        subtotalLabel: 'ONLINE CHANNELS subtotal',
      },
      {
        deptCode:     'Revenue by Channel',
        deptFullName: 'B2B, PARTNERSHIPS & EVENTS',
        subtotalLabel: 'B2B & PARTNERSHIPS subtotal',
      },
      {
        deptCode:     'Revenue by Channel',
        deptFullName: 'REGIONAL CHANNELS',
        subtotalLabel: 'REGIONAL CHANNELS subtotal',
      },
    ],
  },

  // ── 2. Revenue by Product Category ────────────────────────────────────────
  {
    id:         'revenue_product',
    title:      'SECTION 2 — REVENUE BY PRODUCT CATEGORY',
    totalLabel: 'TOTAL PRODUCT REVENUE',
    totalId:    'total_product_revenue',
    note:       'Must reconcile with TOTAL GROSS SALES',
    defaultCollapsed: true,
    hideOwner:  true,
    groups: [
      {
        deptCode:     'Revenue by Product Category',
        deptFullName: 'PERSONAL CARE',
        subtotalLabel: 'PERSONAL CARE subtotal',
      },
      {
        deptCode:     'Revenue by Product Category',
        deptFullName: 'HOME CARE',
        subtotalLabel: 'HOME CARE subtotal',
      },
      {
        deptCode:     'Revenue by Product Category',
        deptFullName: 'GIFT SETS & SEASONAL',
        subtotalLabel: 'GIFT SETS & SEASONAL subtotal',
      },
      {
        deptCode:     'Revenue by Product Category',
        deptFullName: 'MERCHANDISE',
        subtotalLabel: 'MERCHANDISE subtotal',
      },
    ],
  },

  // ── 3. GP Deductions ──────────────────────────────────────────────────────
  {
    id:         'gp_deductions',
    title:      'SECTION 3 — GP DEDUCTIONS',
    totalLabel: 'TOTAL GP DEDUCTIONS',
    totalId:    'total_gp_deductions',
    defaultCollapsed: true,
    groups: [
      {
        deptCode:     'GP',
        deptFullName: 'Gross profit (% fee)',
        subtotalLabel: 'GP Deductions subtotal',
      },
    ],
  },

  // ── 4. Cost of Goods ──────────────────────────────────────────────────────
  {
    id:         'cost_of_goods',
    title:      'SECTION 4 — COST OF GOODS',
    totalLabel: 'TOTAL COST OF GOODS',
    totalId:    'total_cogs',
    defaultCollapsed: true,
    groups: [
      {
        deptCode:     'COGS',
        deptFullName: 'Cost of Goods Sold',
        subtotalLabel: 'COGS subtotal',
      },
      {
        deptCode:      'OEM',
        deptFullName:  'Original Equipment Manufacturer',
        subtotalLabel: 'OEM subtotal',
        defaultOwnerName: 'R&D',
      },
      {
        deptCode:      'Merchandise',
        deptFullName:  'Merchandise',
        subtotalLabel: 'Merchandise subtotal',
        defaultOwnerName: 'Marketing & Sales',
      },
    ],
  },

  // ── 4b. COGM Supporting Schedule (reference only, excluded from P&L calcs) ─
  {
    id:         'cogm_schedule',
    title:      'COGM — Supporting Schedule',
    totalLabel: 'Total COGM',
    totalId:    'total_cogm',
    defaultCollapsed: true,
    groups: [
      {
        deptCode:     'COGM',
        deptFullName: 'Factory (COGM)',
        subtotalLabel: 'COGM subtotal',
      },
      {
        deptCode:     'COGM',
        deptFullName: 'Factory',
        subtotalLabel: 'Factory Overhead subtotal',
      },
    ],
  },

  // ── 5. Operating Expenses ─────────────────────────────────────────────────
  {
    id:         'operating_expenses',
    title:      'SECTION 5 — OPERATING EXPENSES',
    totalLabel: 'TOTAL OPERATING EXPENSES',
    totalId:    'total_opex',
    defaultCollapsed: true,
    groups: [
      {
        deptCode:     'MKT & SALES',
        deptFullName: 'Marketing & Sales',
        subtotalLabel: 'Marketing & Sales subtotal',
      },
      {
        deptCode:     'Retail',
        deptFullName: 'Retail',
        subtotalLabel: 'Retail subtotal',
      },
      {
        deptCode:     'R&D',
        deptFullName: 'R&D',
        subtotalLabel: 'R&D subtotal',
      },
      {
        deptCode:     'OPS & FF',
        deptFullName: 'Stock/Warehouse',
        subtotalLabel: 'Stock/Warehouse subtotal',
      },
      {
        deptCode:     'G&A',
        deptFullName: 'Backbone',
        subtotalLabel: 'Backbone subtotal',
      },
    ],
  },

  // ── 6. CAPEX — 3 collapsible sub-groups ───────────────────────────────────
  {
    id:         'capex',
    title:      'SECTION 6 — CAPEX',
    totalLabel: 'TOTAL CAPEX',
    totalId:    'total_capex',
    defaultCollapsed: true,
    groups: [
      {
        deptCode:     'CAPEX',
        deptFullName: 'Factory Investment',
        subtotalLabel: 'Factory Investment subtotal',
      },
      {
        deptCode:     'CAPEX',
        deptFullName: 'New Store Investment',
        subtotalLabel: 'New Store Investment subtotal',
      },
      {
        deptCode:     'CAPEX',
        deptFullName: 'Lab Instrument Investment',
        subtotalLabel: 'Lab Instrument Investment subtotal',
      },
    ],
  },
]

// ── Calculated rows (in evaluation order — earlier rows may feed into later ones) ──

export const PL_CALCULATED_ROWS: readonly PLCalculatedRow[] = [
  {
    id:            'net_revenue',
    label:         'NET REVENUE',
    afterSectionId: 'gp_deductions',
    terms: [
      { sectionTotalId: 'total_gross_sales',   sign:  1 },
      { sectionTotalId: 'total_gp_deductions', sign: -1 },
    ],
  },
  {
    id:            'gross_profit',
    label:         'GROSS PROFIT',
    afterSectionId: 'cost_of_goods',
    terms: [
      { sectionTotalId: 'net_revenue', sign:  1 },
      { sectionTotalId: 'total_cogs',  sign: -1 },
    ],
  },
  {
    id:            'operating_income',
    label:         'OPERATING INCOME',
    afterSectionId: 'operating_expenses',
    terms: [
      { sectionTotalId: 'gross_profit', sign:  1 },
      { sectionTotalId: 'total_opex',   sign: -1 },
    ],
  },
  {
    id:            'net_income',
    label:         'NET INCOME',
    afterSectionId: 'capex',
    terms: [
      { sectionTotalId: 'operating_income', sign:  1 },
      { sectionTotalId: 'total_capex',      sign: -1 },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** All (deptCode, deptFullName) pairs in P&L order — useful for building queries. */
export function getAllPLDeptPairs(): Array<{ deptCode: string; deptFullName: string }> {
  return PL_SECTIONS.flatMap(s => s.groups.map(g => ({ deptCode: g.deptCode, deptFullName: g.deptFullName })))
}

/** Look up which section + group a dept pair belongs to. */
export function findGroupInPL(
  deptCode: string,
  deptFullName: string,
): { section: PLSection; group: PLGroup } | null {
  for (const section of PL_SECTIONS) {
    for (const group of section.groups) {
      if (group.deptCode === deptCode && group.deptFullName === deptFullName) {
        return { section, group }
      }
    }
  }
  return null
}
