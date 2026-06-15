-- Settings tables: SKU Master, Standard Costs, FG Production
-- Run this in Supabase SQL Editor

-- SKU Master
create table if not exists public.skus (
  id          uuid primary key default gen_random_uuid(),
  sku_code    text not null unique,
  sku_name    text not null,
  uom         text not null default 'ml',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Standard Costs (company-wide per ml per month)
create table if not exists public.standard_costs (
  id          uuid primary key default gen_random_uuid(),
  month       date not null unique,
  dm_per_ml   numeric(12,6) not null default 0,
  dl_per_ml   numeric(12,6) not null default 0,
  moh_per_ml  numeric(12,6) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- FG Production Volumes
create table if not exists public.fg_production (
  id                uuid primary key default gen_random_uuid(),
  month             date not null unique,
  total_volume_ml   numeric(15,4) not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- RLS (service role key bypasses these; anon key is blocked)
alter table public.skus          enable row level security;
alter table public.standard_costs enable row level security;
alter table public.fg_production  enable row level security;

-- Allow authenticated users to read; service role handles writes
create policy "auth_read_skus"           on public.skus          for select using (auth.role() = 'authenticated');
create policy "auth_read_standard_costs" on public.standard_costs for select using (auth.role() = 'authenticated');
create policy "auth_read_fg_production"  on public.fg_production  for select using (auth.role() = 'authenticated');
