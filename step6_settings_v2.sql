-- v2 migration: run ONLY if you already ran step5_settings_tables.sql
-- Adds volume_ml + unique sku_name to skus,
-- rebuilds standard_costs as per-SKU with effective_month.

-- 1. skus: add volume_ml, make sku_name unique
alter table public.skus add column if not exists volume_ml numeric(12,4);
create unique index if not exists skus_sku_name_key on public.skus (sku_name);

-- 2. standard_costs: drop old (company-wide monthly) and recreate per-SKU
drop table if exists public.standard_costs;

create table public.standard_costs (
  id              uuid primary key default gen_random_uuid(),
  sku_id          uuid not null references public.skus(id) on delete cascade,
  effective_month date not null,
  dm_per_ml       numeric(12,6) not null default 0,
  dl_per_ml       numeric(12,6) not null default 0,
  moh_per_ml      numeric(12,6) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(sku_id, effective_month)
);

alter table public.standard_costs enable row level security;
create policy "auth_read_standard_costs"
  on public.standard_costs for select using (auth.role() = 'authenticated');
