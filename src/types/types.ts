// 订单状态类型
export type OrderStatus =
  | 'created'
  | 'pending_payment'
  | 'making'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'deleted';

// 支付方式类型
export type PaymentMethod = 'wechat' | 'alipay' | 'paypay' | 'cash';

// 商品分类
export interface Category {
  id: string;
  name: string;
  name_ja: string | null;
  name_en: string | null;
  name_ko: string | null;
  sort_order: number;
  /** false = 不作为顾客端分类栏出现，其商品也不进入「全部」栏（用于停售/归档分类） */
  is_visible: boolean;
  created_at: string;
}

// 商品详情段落块
export type DetailSectionType = 'text' | 'image';
export interface DetailSection {
  type: DetailSectionType;
  content: string;      // 中文内容（或图片URL）
  content_ja?: string;  // 日文文字内容（仅 text 类型）
  content_en?: string;  // 英文文字内容
  content_ko?: string;  // 韩文文字内容
}

/** 获取当前语言的段落文字（回退至中文） */
export function getLocalizedSectionContent(sec: DetailSection, lang: string): string {
  if (sec.type !== 'text') return sec.content;
  if (lang === 'ja' && sec.content_ja) return sec.content_ja;
  if (lang === 'en' && sec.content_en) return sec.content_en;
  if (lang === 'ko' && sec.content_ko) return sec.content_ko;
  return sec.content;
}

// 商品
export interface Product {
  id: string;
  /** 主分类：分类内排序与旧版回退都用它 */
  category_id: string;
  /** 该商品出现的全部分类（含主分类）；菜单按它判断商品属于哪些分类 */
  category_ids: string[];
  name: string;
  name_ja: string | null;
  name_en: string | null;
  name_ko: string | null;
  description: string | null;
  description_ja: string | null;
  description_en: string | null;
  description_ko: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  detail_sections: DetailSection[];
  created_at: string;
}

/**
 * 商品在菜单里归属的分类 id 列表。
 * `category_ids` 是展示归属的唯一依据（空数组 = 有意不放进任何分类栏，例如只留历史订单的停产单品）；
 * 旧数据没有该列时回退到主分类 `category_id`。
 * @param product 至少含 category_id 与 category_ids 的商品
 * @returns 去重后的分类 id 列表
 */
export function getProductCategoryIds(
  product: Pick<Product, 'category_id'> & { category_ids?: string[] | null }
): string[] {
  if (Array.isArray(product.category_ids)) return Array.from(new Set(product.category_ids.filter(Boolean)));
  return product.category_id ? [product.category_id] : [];
}

/**
 * 判断商品是否属于某个分类（多分类：一份数据可出现在多个分类下）。
 * @param product 至少含 category_id 与 category_ids 的商品
 * @param categoryId 目标分类 id
 * @returns 属于该分类时为 true
 */
export function productInCategory(
  product: Pick<Product, 'category_id'> & { category_ids?: string[] | null },
  categoryId: string
): boolean {
  return getProductCategoryIds(product).includes(categoryId);
}

// i18n 辅助：获取当前语言的名称（无则回退中文）
import type { Lang } from '@/i18n/translations';
export function getLocalizedName(item: Category | Product, lang: Lang): string {
  if (lang === 'zh') return item.name;
  const key = `name_${lang}` as keyof typeof item;
  return (item[key] as string | null)?.trim() || item.name;
}
export function getLocalizedDesc(product: Product, lang: Lang): string | null {
  if (lang === 'zh') return product.description;
  const key = `description_${lang}` as keyof Product;
  return (product[key] as string | null)?.trim() || product.description;
}

// 商品（含分类信息）
export interface ProductWithCategory extends Product {
  categories?: Category;
}

// 订单
export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  total_amount: number;
  customer_lang: string;
  created_at: string;
  updated_at: string;
}

// 订单明细
export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
  /** 该菜品是否已制作完成（套餐以单品为单位记在 order_item_options.made 上） */
  made?: boolean;
  // 关联的已选选项快照（可选，仅在关联查询时存在）
  order_item_options?: OrderItemOption[];
}

// 订单（含明细）
export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

// 支付配置
export interface PaymentConfig {
  id: string;
  wechat_enabled: boolean;
  wechat_qrcode_url: string | null;
  wechat_rate: number;
  alipay_enabled: boolean;
  alipay_qrcode_url: string | null;
  alipay_rate: number;
  paypay_enabled: boolean;
  paypay_qrcode_url: string | null;
  paypay_rate: number;
  cash_enabled: boolean;
  cash_rate: number;
  admin_password_hash: string;
  updated_at: string;
}

export type RateKey = 'wechat_rate' | 'alipay_rate' | 'paypay_rate' | 'cash_rate';

// 管理员配置
export interface AdminConfig {
  id: string;
  password: string;
  default_lang?: string;
  print_width_mm: number;
  print_height_mm: number;
  print_auto: boolean;
  print_copies: number;
}

// 打印配置（AdminConfig 的子集）
export interface PrintConfig {
  id: string;
  print_width_mm: number;
  print_height_mm: number;
  print_auto: boolean;
  print_copies: number;
}

// 商品自定义选项
export interface ProductOption {
  id: string;
  product_id: string | null;   // null = 全局默认模板
  name_zh: string;
  name_ja: string;
  name_en: string;
  name_ko: string;
  image_url: string | null;
  price: number;
  default_qty: number;
  sort_order: number;
  enabled: boolean;
  deleted_at: string | null;
  created_at: string;
}

// 套餐分组：一个套餐由若干组构成，顾客每组选一项
export interface ComboGroup {
  id: string;
  product_id: string;
  title: string;
  title_ja: string | null;
  title_en: string | null;
  title_ko: string | null;
  sort_order: number;
}

// 套餐选项：某个分组下可选的一个商品，price_delta 是在套餐价上的加减
export interface ComboOption {
  id: string;
  group_id: string;
  product: Product;
  price_delta: number;
  sort_order: number;
}

/**
 * 套餐加料快照名里的分隔符：前半是单品名、后半是加料名。
 * 出餐台按它把加料挂回对应单品（`拿铁咖啡 · 换燕麦奶`）。
 */
export const COMBO_ADDON_SEPARATOR = ' · ';

/**
 * 套餐加料的快照名：带上归属的单品，否则两杯都有加料时看不出是哪一杯。
 * @param productName 单品名称（当前语言）
 * @param optionName 加料名称（当前语言）
 * @returns 形如 `拿铁咖啡 · 换燕麦奶` 的字符串
 */
export function comboAddonSnapshot(productName: string, optionName: string): string {
  return `${productName}${COMBO_ADDON_SEPARATOR}${optionName}`;
}

/** 套餐里给某个已选单品追加的自定义选项 */
export interface ComboAddonPick {
  /** 加料挂在哪个已选单品上 */
  product: Product;
  option: ProductOption;
  quantity: number;
}

/** 套餐二级页确认时回传的完整选择：每组一项 + 各单品的加料 */
export interface ComboSelection {
  picked: ComboOption[];
  addons: ComboAddonPick[];
}

/** 取当前语言的分组标题（空则回退中文） */
export function getLocalizedGroupTitle(group: ComboGroup, lang: Lang): string {
  if (lang === 'ja' && group.title_ja) return group.title_ja;
  if (lang === 'en' && group.title_en) return group.title_en;
  if (lang === 'ko' && group.title_ko) return group.title_ko;
  return group.title;
}

// 订单明细中的已选选项快照
export interface OrderItemOption {
  id: string;
  order_item_id: string;
  option_id: string | null;
  option_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  /** 套餐单品是否已制作完成；普通加料恒为 false，不参与勾选 */
  made?: boolean;
}

// 获取选项当前语言名称（回退中文）
export function getLocalizedOptionName(opt: ProductOption, lang: Lang): string {
  if (lang === 'zh') return opt.name_zh || opt.name_zh;
  const map: Record<Exclude<Lang, 'zh'>, string> = {
    ja: opt.name_ja,
    en: opt.name_en,
    ko: opt.name_ko,
  };
  return map[lang]?.trim() || opt.name_zh;
}

// 购物车已选选项
export interface CartItemOption {
  option_id: string;
  name_snapshot: string;  // 下单时的当前语言名称
  quantity: number;
  unit_price: number;
}

// 购物车项
export interface CartItem {
  product: Product;
  quantity: number;
  selectedOptions: CartItemOption[];
}

// 统计数据
export interface ProductStat {
  product_id: string;
  product_name: string;
  quantity: number;
  revenue: number;
}

// 订单状态显示名称映射
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  created: '已创建',
  pending_payment: '待确认支付',
  making: '正在制作',
  ready: '待领取',
  completed: '已完成',
  cancelled: '已取消',
  deleted: '已删除',
};

// 支付方式显示名称映射
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  paypay: 'PayPay',
  cash: '现金支付',
};

// 订单状态流转顺序
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'created',
  'pending_payment',
  'making',
  'ready',
  'completed',
];

// 获取下一个订单状态
export function getNextStatus(current: OrderStatus): OrderStatus | null {
  const idx = ORDER_STATUS_FLOW.indexOf(current);
  if (idx < 0 || idx >= ORDER_STATUS_FLOW.length - 1) return null;
  return ORDER_STATUS_FLOW[idx + 1];
}

// 获取状态推进操作按钮文字
export const ORDER_STATUS_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  pending_payment: '确认支付 → 制作中',
  making: '制作完成 → 待领取',
  ready: '已领取 → 完成订单',
};
