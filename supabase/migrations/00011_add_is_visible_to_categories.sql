-- 分类可见性：is_visible=false 的分类不作为顾客端 tab 出现，其商品也不进入「全部」栏。
-- 用途：停售/归档商品集中存放，既不占菜单版面，又保留在后台可查、可随时恢复。
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

-- 让 PostgREST 立即感知新列
NOTIFY pgrst, 'reload schema';
