import { supabase } from '@/db/supabase';
import type {
  Category,
  Product,
  Order,
  OrderItem,
  OrderWithItems,
  PaymentConfig,
  OrderStatus,
  PaymentMethod,
  CartItem,
  ProductOption,
  ComboGroup,
  ComboOption,
} from '@/types/types';

// ─── 实时汇率（日元 → 人民币） ─────────────────────────────
let fxCache: { rate: number; at: number } | null = null;
const FX_TTL_MS = 60 * 60 * 1000;
const FX_STORE_KEY = 'jpy_cny_rate';

/**
 * 抓取「1 日元 = 多少人民币」的实时汇率，内存缓存 1 小时。
 * 依次尝试两个免密钥的公开接口；都失败时回退到上一次成功缓存的汇率（7 天内）。
 * @returns 汇率（如 0.048），完全拿不到时为 null
 */
export async function fetchJpyToCnyRate(): Promise<number | null> {
  if (fxCache && Date.now() - fxCache.at < FX_TTL_MS) return fxCache.rate;

  const remember = (rate: number) => {
    fxCache = { rate, at: Date.now() };
    try { localStorage.setItem(FX_STORE_KEY, JSON.stringify(fxCache)); } catch { /* 隐私模式忽略 */ }
    return rate;
  };

  const sources: Array<{ url: string; pick: (j: unknown) => unknown }> = [
    { url: 'https://open.er-api.com/v6/latest/JPY', pick: j => (j as { rates?: { CNY?: number } })?.rates?.CNY },
    { url: 'https://api.frankfurter.app/latest?from=JPY&to=CNY', pick: j => (j as { rates?: { CNY?: number } })?.rates?.CNY },
  ];

  for (const src of sources) {
    try {
      const res = await fetch(src.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const rate = Number(src.pick(await res.json()));
      // 日元兑人民币永远小于 1，落在这个区间才算拿到真汇率
      if (Number.isFinite(rate) && rate > 0 && rate < 1) return remember(rate);
    } catch {
      // 该源不可用，换下一个
    }
  }

  // 都失败：用本地记着的上一次汇率（7 天内），总比拍脑袋的数字靠谱
  try {
    const saved = JSON.parse(localStorage.getItem(FX_STORE_KEY) ?? 'null') as { rate?: number; at?: number } | null;
    if (saved?.rate && saved.at && Date.now() - saved.at < 7 * 24 * 3600 * 1000) return saved.rate;
  } catch {
    // 存储不可用则放弃
  }
  return null;
}

// ─── 套餐组合 ─────────────────────────────────────────────
/**
 * 拉取全部套餐分组与选项（选项内嵌商品，用于取名称与图片）。
 * @returns 分组与其选项，均按 sort_order 升序
 */
export async function fetchComboCatalog(): Promise<{ groups: ComboGroup[]; options: ComboOption[] }> {
  const [{ data: groups, error: gErr }, { data: options, error: oErr }] = await Promise.all([
    supabase.from('combo_groups').select('*').order('sort_order', { ascending: true }),
    supabase
      .from('combo_options')
      .select('id, group_id, price_delta, sort_order, product:products(*)')
      .eq('enabled', true)
      .order('sort_order', { ascending: true }),
  ]);
  if (gErr) throw gErr;
  if (oErr) throw oErr;
  return {
    groups: (Array.isArray(groups) ? groups : []) as ComboGroup[],
    options: (Array.isArray(options) ? options : []).map(o => ({
      id: o.id,
      group_id: o.group_id,
      price_delta: Number(o.price_delta),
      sort_order: o.sort_order,
      product: (o as unknown as { product: Product }).product,
    })).filter(o => !!o.product),
  };
}

// ─── 分类 ───────────────────────────────────────────────
export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(c => ({ ...c, is_visible: c.is_visible !== false }));
}

export async function createCategory(
  name: string,
  sort_order: number,
  i18n?: { name_ja?: string; name_en?: string; name_ko?: string },
  is_visible: boolean = true
): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name, sort_order, is_visible, ...i18n });
  if (error) throw error;
}

export async function updateCategory(
  id: string,
  name: string,
  sort_order: number,
  i18n?: { name_ja?: string; name_en?: string; name_ko?: string },
  is_visible: boolean = true
): Promise<void> {
  const { error } = await supabase.from('categories').update({ name, sort_order, is_visible, ...i18n }).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string): Promise<void> {
  // 检查是否有商品（多分类：主分类或 category_ids 里含该分类都算）
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .or(`category_id.eq.${id},category_ids.cs.{${id}}`);
  if (count && count > 0) throw new Error('该分类下有商品，无法删除');
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

// ─── 商品 ───────────────────────────────────────────────
export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('category_id', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(p => ({
    ...p,
    detail_sections: Array.isArray(p.detail_sections) ? p.detail_sections : [],
    category_ids: Array.isArray(p.category_ids) ? p.category_ids : [p.category_id],
  }));
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    detail_sections: Array.isArray(data.detail_sections) ? data.detail_sections : [],
    category_ids: Array.isArray(data.category_ids) ? data.category_ids : [data.category_id],
  };
}

export async function createProduct(product: Omit<Product, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('products').insert(product);
  if (error) throw error;
}

export async function updateProduct(id: string, updates: Partial<Product>): Promise<void> {
  const { error } = await supabase.from('products').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ─── 订单 ───────────────────────────────────────────────
// 带选项快照的嵌套查询字符串
const ORDER_WITH_OPTIONS_SELECT = '*, order_items(*, order_item_options(*))';

export async function fetchOrders(statusFilter?: OrderStatus[]): Promise<OrderWithItems[]> {
  let query = supabase
    .from('orders')
    .select(ORDER_WITH_OPTIONS_SELECT)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(200);

  if (statusFilter && statusFilter.length > 0) {
    query = query.in('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fetchOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_OPTIONS_SELECT)
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createOrder(
  cartItems: CartItem[],
  totalAmount: number,
  paymentMethod: PaymentMethod,
  customerLang: string = 'zh'
): Promise<Order> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  const orderNumber = `ORD-${dateStr}-${rand}`;

  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      status: 'created',
      payment_method: paymentMethod,
      total_amount: totalAmount,
      customer_lang: customerLang,
    })
    .select()
    .maybeSingle();

  if (orderError) throw orderError;
  if (!orderData) throw new Error('创建订单失败');

  // 先确定哪些 option_id 是真实的自定义选项（order_item_options.option_id 有外键指向
  // product_options；套餐选项来自 combo_options，写进去会 409）
  const cartOptionIds = [...new Set(
    cartItems.flatMap(ci => ci.selectedOptions.map(o => o.option_id)).filter(Boolean)
  )];
  let validOptionIds = new Set<string>();
  if (cartOptionIds.length > 0) {
    const { data: optRows } = await supabase
      .from('product_options')
      .select('id')
      .in('id', cartOptionIds);
    validOptionIds = new Set((Array.isArray(optRows) ? optRows : []).map(r => r.id as string));
  }

  // 逐条插入 order_items，并收集 ID 用于写入选项快照
  for (const ci of cartItems) {
    const optionsSubtotal = ci.selectedOptions.reduce(
      (s, o) => s + o.unit_price * o.quantity, 0
    );
    const itemSubtotal = (ci.product.price + optionsSubtotal) * ci.quantity;

    const { data: itemData, error: itemErr } = await supabase
      .from('order_items')
      .insert({
        order_id: orderData.id,
        product_id: ci.product.id,
        product_name: ci.product.name,
        product_price: ci.product.price,
        quantity: ci.quantity,
        subtotal: itemSubtotal,
      })
      .select('id')
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!itemData) continue;

    if (ci.selectedOptions.length > 0) {
      const optRows = ci.selectedOptions.map(o => ({
        order_item_id: itemData.id,
        // option_id 上有外键指向 product_options：套餐选项的 id 来自 combo_options，
        // 直接写会 409 导致下单失败，这里只保留真实的自定义选项 id，其余写 null
        // （option_name 快照照常保留，出餐与打印不受影响）
        option_id: validOptionIds.has(o.option_id) ? o.option_id : null,
        option_name: o.name_snapshot,
        quantity: o.quantity,
        unit_price: o.unit_price,
        subtotal: o.unit_price * o.quantity,
      }));
      const { error: optErr } = await supabase.from('order_item_options').insert(optRows);
      if (optErr) throw optErr;
    }
  }

  return orderData as Order;
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId);
  if (error) throw error;
}

/**
 * 标记普通菜品是否已制作完成（落库，刷新/换设备都保留）。
 * @param orderItemId order_items.id
 * @param made 是否已完成
 */
export async function setOrderItemMade(orderItemId: string, made: boolean): Promise<void> {
  const { error } = await supabase
    .from('order_items')
    .update({ made })
    .eq('id', orderItemId);
  if (error) throw error;
}

/**
 * 标记套餐里的单个单品是否已制作完成（记在 order_item_options.made 上）。
 * @param optionRowId order_item_options.id
 * @param made 是否已完成
 */
export async function setOrderItemOptionMade(optionRowId: string, made: boolean): Promise<void> {
  const { error } = await supabase
    .from('order_item_options')
    .update({ made })
    .eq('id', optionRowId);
  if (error) throw error;
}

// ─── 商品自定义选项 ─────────────────────────────────────────────
/** 读取某商品的所有启用选项（含未软删除） */
export async function fetchProductOptions(productId: string): Promise<ProductOption[]> {
  const { data, error } = await supabase
    .from('product_options')
    .select('*')
    .eq('product_id', productId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** 读取全局默认模板（product_id IS NULL） */
export async function fetchGlobalDefaultOptions(): Promise<ProductOption[]> {
  const { data, error } = await supabase
    .from('product_options')
    .select('*')
    .is('product_id', null)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

type OptionPayload = Omit<ProductOption, 'id' | 'created_at' | 'deleted_at'>;

export async function upsertProductOption(
  opt: Partial<OptionPayload> & { id?: string; product_id: string }
): Promise<void> {
  if (opt.id) {
    const { error } = await supabase
      .from('product_options')
      .update({ ...opt })
      .eq('id', opt.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('product_options')
      .insert({ ...opt });
    if (error) throw error;
  }
}

/** 软删除 */
export async function softDeleteProductOption(optionId: string): Promise<void> {
  const { error } = await supabase
    .from('product_options')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', optionId);
  if (error) throw error;
}

export async function fetchActiveDisplayOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('status', ['making', 'ready'])
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ─── 支付配置 ────────────────────────────────────────────
export async function fetchPaymentConfig(): Promise<PaymentConfig | null> {
  const { data, error } = await supabase
    .from('payment_config')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePaymentConfig(
  id: string,
  updates: Partial<PaymentConfig>
): Promise<void> {
  const { error } = await supabase
    .from('payment_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ─── 打印配置 ─────────────────────────────────────────────
import type { PrintConfig } from '@/types/types';

export async function fetchPrintConfig(): Promise<PrintConfig> {
  const { data, error } = await supabase
    .from('admin_config')
    .select('id, print_width_mm, print_height_mm, print_auto, print_copies')
    .maybeSingle();
  if (error) throw error;
  return data ?? { id: '', print_width_mm: 50, print_height_mm: 70, print_auto: false, print_copies: 1 };
}

export async function updatePrintConfig(updates: Partial<Omit<PrintConfig, 'id'>>): Promise<void> {
  const { error } = await supabase
    .from('admin_config')
    .update(updates)
    .not('id', 'is', null);
  if (error) throw error;
}

// ─── 管理员密码校验 ───────────────────────────────────────
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admin_config')
    .select('password')
    .maybeSingle();
  if (error) throw error;
  return data?.password === password;
}

// ─── 默认语言 ─────────────────────────────────────────────
export async function fetchDefaultLang(): Promise<string> {
  const { data, error } = await supabase
    .from('admin_config')
    .select('default_lang')
    .maybeSingle();
  if (error) return 'zh';
  return (data?.default_lang as string) || 'zh';
}

export async function updateDefaultLang(lang: string): Promise<void> {
  const { error } = await supabase
    .from('admin_config')
    .update({ default_lang: lang });
  if (error) throw error;
}

// ─── 统计 ────────────────────────────────────────────────
export async function fetchStats(): Promise<{
  totalRevenue: number;
  productStats: { product_name: string; quantity: number; revenue: number }[];
}> {
  // 取所有已完成订单的明细
  const { data, error } = await supabase
    .from('order_items')
    .select('product_name, product_price, quantity, subtotal, orders!inner(status)')
    .eq('orders.status', 'completed')
    .limit(1000);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];

  const map = new Map<string, { quantity: number; revenue: number }>();
  let totalRevenue = 0;

  for (const row of rows) {
    const name = row.product_name as string;
    const qty = row.quantity as number;
    const sub = row.subtotal as number;
    totalRevenue += sub;
    const existing = map.get(name) ?? { quantity: 0, revenue: 0 };
    map.set(name, { quantity: existing.quantity + qty, revenue: existing.revenue + sub });
  }

  const productStats = Array.from(map.entries()).map(([product_name, v]) => ({
    product_name,
    ...v,
  })).sort((a, b) => b.revenue - a.revenue);

  return { totalRevenue, productStats };
}

// ─── 图片上传 ─────────────────────────────────────────────
export async function uploadImage(
  bucket: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  // 压缩超过1MB的图片
  let uploadFile = file;
  if (file.size > 1024 * 1024) {
    uploadFile = await compressImage(file);
  }

  const ext = uploadFile.type === 'image/webp' ? 'webp' : uploadFile.name.split('.').pop() || 'jpg';
  const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  onProgress?.(10);

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fileName, uploadFile, { contentType: uploadFile.type });

  if (error) throw error;
  onProgress?.(90);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
  onProgress?.(100);
  return urlData.publicUrl;
}

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxW = 1920, maxH = 1080;
      let w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        blob => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
        },
        'image/webp',
        0.8
      );
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}
