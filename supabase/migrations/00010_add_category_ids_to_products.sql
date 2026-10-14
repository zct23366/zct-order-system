-- 商品多分类：category_id 保留为主分类（列表排序与向后兼容），category_ids 记录该商品出现的全部分类。
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- 回填：既有商品至少属于自己的主分类
UPDATE products
SET category_ids = ARRAY[category_id]
WHERE category_ids IS NULL OR category_ids = '{}'::uuid[];

-- 支持 PostgREST 的 category_ids=cs.{<id>} 过滤
CREATE INDEX IF NOT EXISTS products_category_ids_idx ON products USING GIN (category_ids);

-- 让 PostgREST 立即感知新列
NOTIFY pgrst, 'reload schema';
