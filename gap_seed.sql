-- =============================================================
-- gap_seed.sql  —  Fills rows missed by step3_seed.sql
--
-- Root cause: departments has a UNIQUE constraint on 'code'.
-- 'Revenue by Channel' and 'Revenue by Product Category' each
-- appear with multiple full_name values in the CSV; only the
-- first full_name per code was stored. The original seed's
-- category/line_item JOINs on (code AND full_name) then found
-- no matching dept row for the remaining variants.
--
-- Gaps: 6 departments | 22 categories | 26 line items
--
-- After running this, verify with:
-- SELECT (SELECT count(*) FROM departments) AS depts,
--        (SELECT count(*) FROM categories)  AS cats,
--        (SELECT count(*) FROM line_items)  AS line_items;
-- If unique constraint is on (code): expect 14 | 104 | 214
-- If unique constraint is on (code, full_name): expect 20 | 104 | 214
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Missing departments (6)
--    These share a 'code' with a row already in the DB.
--    ON CONFLICT DO NOTHING silently skips them if the unique
--    constraint is on code alone — sections 2 & 3 still work.
-- ─────────────────────────────────────────────────────────────
INSERT INTO departments (code, full_name) VALUES
  ('Revenue by Channel', 'ONLINE CHANNELS'),
  ('Revenue by Channel', 'B2B, PARTNERSHIPS & EVENTS'),
  ('Revenue by Channel', 'REGIONAL CHANNELS'),
  ('Revenue by Product Category', 'HOME CARE'),
  ('Revenue by Product Category', 'GIFT SETS & SEASONAL'),
  ('Revenue by Product Category', 'MERCHANDISE')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. Missing categories (22)
--    JOIN on dept code only — no full_name filter.
-- ─────────────────────────────────────────────────────────────
INSERT INTO categories (department_id, name, is_hr_category)
SELECT d.id, v.cat_name, v.is_hr
FROM (VALUES
  ('Revenue by Channel', 'E-commerce Platforms - Thailand', false::boolean),
  ('Revenue by Channel', 'Online DTC - Thailand', false),
  ('Revenue by Channel', 'Corporate Gifting & Custom Orders', false),
  ('Revenue by Channel', 'Hotel Amenities Programs', false),
  ('Revenue by Channel', 'Events (Markets/Festivals/Private)', false),
  ('Revenue by Channel', 'Singapore', false),
  ('Revenue by Channel', 'Taiwan', false),
  ('Revenue by Channel', 'Hong Kong', false),
  ('Revenue by Channel', 'E-commerce Platforms - Regional', false),
  ('Revenue by Product Category', 'Ambient Parfum', false),
  ('Revenue by Product Category', 'Ambient Diffuser', false),
  ('Revenue by Product Category', 'Fabric Fragrance', false),
  ('Revenue by Product Category', 'Surface Cleaner', false),
  ('Revenue by Product Category', 'Dish Soap', false),
  ('Revenue by Product Category', 'Blooming', false),
  ('Revenue by Product Category', 'Wood Cleanser', false),
  ('Revenue by Product Category', 'Wood Oil', false),
  ('Revenue by Product Category', 'Dry Wool Wash', false),
  ('Revenue by Product Category', 'GIFT SETS & SEASONAL', false),
  ('Revenue by Product Category', 'Kindness Tote Bag', false),
  ('Revenue by Product Category', 'Stay Kind Cap', false),
  ('Revenue by Product Category', 'Kindness Carryall', false)
) AS v(dept_code, cat_name, is_hr)
JOIN departments d ON d.code = v.dept_code
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Missing line items (26)
--    JOIN on dept code → category name chain.
-- ─────────────────────────────────────────────────────────────
INSERT INTO line_items (category_id, name, subcategory_l1, owner, type, phase2_auto)
SELECT c.id, v.name, v.subcategory_l1, v.owner, v.type, v.phase2_auto
FROM (VALUES
  ('Revenue by Channel', 'E-commerce Platforms - Thailand', 'Shopee', NULL::text, NULL::text, 'REVENUE', false::boolean),
  ('Revenue by Channel', 'E-commerce Platforms - Thailand', 'Lazada', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'E-commerce Platforms - Thailand', 'Tiktok', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Online DTC - Thailand', 'LINE OA', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Online DTC - Thailand', 'LINE Shopping', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Corporate Gifting & Custom Orders', 'Corporate Gifting & Custom Orders', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Hotel Amenities Programs', 'Hotel Amenities Programs', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Events (Markets/Festivals/Private)', 'Events (Markets/Festivals/Private)', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Singapore', 'Singapore', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Taiwan', 'Taiwan', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'Hong Kong', 'Hong Kong', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'E-commerce Platforms - Regional', 'Website International', NULL, NULL, 'REVENUE', false),
  ('Revenue by Channel', 'E-commerce Platforms - Regional', 'Shopee Regional', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Ambient Parfum', 'Ambient Parfum', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Ambient Diffuser', 'Ambient Diffuser', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Fabric Fragrance', 'Fabric Fragrance', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Surface Cleaner', 'Surface Cleaner', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Dish Soap', 'Dish Soap', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Blooming', 'Blooming', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Wood Cleanser', 'Wood Cleanser', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Wood Oil', 'Wood Oil', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Dry Wool Wash', 'Dry Wool Wash', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'GIFT SETS & SEASONAL', 'GIFT SETS & SEASONAL', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Kindness Tote Bag', 'Kindness Tote Bag', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Stay Kind Cap', 'Stay Kind Cap', NULL, NULL, 'REVENUE', false),
  ('Revenue by Product Category', 'Kindness Carryall', 'Kindness Carryall', NULL, NULL, 'REVENUE', false)
) AS v(dept_code, cat_name, name, subcategory_l1, owner, type, phase2_auto)
JOIN departments d ON d.code = v.dept_code
JOIN categories c ON c.department_id = d.id AND c.name = v.cat_name
ON CONFLICT DO NOTHING;