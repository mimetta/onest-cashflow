-- Settings tables: SKU Master, Standard Costs, FG Production, Sales Units
-- Run this in Supabase SQL Editor (fresh install)

-- SKU Master
create table if not exists public.skus (
  id          uuid primary key default gen_random_uuid(),
  sku_code    text not null unique,
  sku_name    text not null unique,
  uom         text not null default 'ml',
  volume_ml   numeric(12,4),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Standard Costs: DM/ml per SKU per effective month
-- DL/ml and MOH/ml are auto-calculated from COGM actuals ÷ FG qty
create table if not exists public.standard_costs (
  id              uuid primary key default gen_random_uuid(),
  sku_id          uuid not null references public.skus(id) on delete cascade,
  effective_month date not null,
  dm_per_ml       numeric(12,6) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(sku_id, effective_month)
);

-- FG Production Volumes (monthly total output in ml)
create table if not exists public.fg_production (
  id                uuid primary key default gen_random_uuid(),
  month             date not null unique,
  total_volume_ml   numeric(15,4) not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Sales Units (units sold per SKU per month)
create table if not exists public.sales_units (
  id          uuid primary key default gen_random_uuid(),
  sku_id      uuid not null references public.skus(id) on delete cascade,
  month       date not null,
  units_sold  numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(sku_id, month)
);

-- RLS
alter table public.skus          enable row level security;
alter table public.standard_costs enable row level security;
alter table public.fg_production  enable row level security;
alter table public.sales_units    enable row level security;

create policy "auth_read_skus"           on public.skus          for select using (auth.role() = 'authenticated');
create policy "auth_read_standard_costs" on public.standard_costs for select using (auth.role() = 'authenticated');
create policy "auth_read_fg_production"  on public.fg_production  for select using (auth.role() = 'authenticated');
create policy "auth_read_sales_units"    on public.sales_units    for select using (auth.role() = 'authenticated');
