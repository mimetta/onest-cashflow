-- v3 migration: run ONLY if you already ran step5 + step6.
-- Removes dl_per_ml / moh_per_ml from standard_costs (now auto-calculated).
-- Adds sales_units table.

-- 1. standard_costs: drop DL/MOH columns (now calc'd from COGM actuals ÷ FG qty)
alter table public.standard_costs drop column if exists dl_per_ml;
alter table public.standard_costs drop column if exists moh_per_ml;
alter table public.standard_costs drop column if exists total_per_ml;
alter table public.standard_costs add column if not exists dm_per_ml numeric(12,6) not null default 0;

-- 2. Create sales_units table
create table if not exists public.sales_units (
  id          uuid primary key default gen_random_uuid(),
  sku_id      uuid not null references public.skus(id) on delete cascade,
  month       date not null,
  units_sold  numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(sku_id, month)
);

alter table public.sales_units enable row level security;
create policy "auth_read_sales_units"
  on public.sales_units for select using (auth.role() = 'authenticated');
