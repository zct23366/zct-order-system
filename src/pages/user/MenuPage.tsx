import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, UtensilsCrossed, Phone, Sparkles, X, Zap, Languages, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import { useMenu } from '@/hooks/useData';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Product, ProductOption, CartItemOption } from '@/types/types';
import { getLocalizedName, getLocalizedDesc, getLocalizedOptionName, getLocalizedSectionContent, productInCategory, getProductCategoryIds } from '@/types/types';
import type { ComboGroup, ComboOption } from '@/types/types';
import { fetchProductOptions, fetchComboCatalog } from '@/services/api';
import ComboPage from '@/components/menu/ComboPage';
import { comboTextOf } from '@/i18n/comboText';

/** 商品排序方式：默认＝后台配置的编号顺序，其余按价格。 */
type SortKey = 'default' | 'priceAsc' | 'priceDesc';
const SORT_KEYS: SortKey[] = ['default', 'priceAsc', 'priceDesc'];

export default function MenuPage() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useLanguage();
  const { categories, products, loading } = useMenu();
  const { items, addItem, removeItem, updateQuantity, clearCart, totalAmount, totalCount } = useCart();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [cartOpen, setCartOpen] = useState(false);

  // ── 商品详情弹窗状态 ──
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [detailClosing, setDetailClosing] = useState(false);

  // ── 自定义选项状态 ──
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [optQty, setOptQty] = useState<Record<string, number>>({}); // optionId → qty

  // ── 套餐二级页面状态 ──
  const [comboProduct, setComboProduct] = useState<Product | null>(null);
  const [comboGroups, setComboGroups] = useState<ComboGroup[]>([]);
  const [comboOptions, setComboOptions] = useState<ComboOption[]>([]);

  useEffect(() => {
    let alive = true;
    fetchComboCatalog()
      .then(({ groups, options }) => {
        if (!alive) return;
        setComboGroups(groups);
        setComboOptions(options);
      })
      .catch(() => { /* 没有套餐数据时菜单照常工作 */ });
    return () => { alive = false; };
  }, []);

  /** 该商品配置了套餐分组就进套餐二级页，否则走普通详情弹层 */
  const comboProductIds = useMemo(() => new Set(comboGroups.map(g => g.product_id)), [comboGroups]);

  const openProduct = (product: Product) => {
    const hasCombo = comboGroups.some(g => g.product_id === product.id);
    if (hasCombo) {
      setComboProduct(product);
      return;
    }
    void openDetail(product);
  };

  const handleComboConfirm = (picked: ComboOption[]) => {
    if (!comboProduct) return;
    const selectedOptions: CartItemOption[] = picked.map(o => ({
      option_id: o.id,
      name_snapshot: getLocalizedName(o.product, lang),
      quantity: 1,
      unit_price: o.price_delta,
    }));
    addItem(comboProduct, selectedOptions);
    toast.success(`${getLocalizedName(comboProduct, lang)} · ${t.menu.detail.addToCart}`, { duration: 1600 });
    setComboProduct(null);
  };

  const openDetail = async (product: Product) => {
    setDetailProduct(product);
    setDetailQty(1);
    setDetailClosing(false);
    // 拉取选项并初始化默认数量
    try {
      const opts = await fetchProductOptions(product.id);
      const enabledOpts = opts.filter(o => o.enabled);
      setOptions(enabledOpts);
      const initQty: Record<string, number> = {};
      enabledOpts.forEach(o => { initQty[o.id] = o.default_qty; });
      setOptQty(initQty);
    } catch {
      setOptions([]);
      setOptQty({});
    }
  };

  const closeDetail = () => {
    setDetailClosing(true);
    setTimeout(() => {
      setDetailProduct(null);
      setDetailClosing(false);
      setOptions([]);
      setOptQty({});
    }, 260);
  };

  // 菜单页是整屏固定布局，body 全程锁死：页面不能被上下拖动。
  // 一旦能拖动，移动端浏览器的地址栏/工具栏就会带着模糊和渐变压到页面顶部，
  // 看起来像顶栏被糊住、被挡住。
  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = '';
    };
  }, []);

  /** 计算选项附加价格小计 */
  const optionsExtra = options.reduce((s, o) => s + o.price * (optQty[o.id] ?? 0), 0);
  /** 整个弹窗的小计：(基础价 + 选项附加) × 主商品数量 */
  const detailSubtotal = detailProduct
    ? (Number(detailProduct.price) + optionsExtra) * detailQty
    : 0;

  const buildSelectedOptions = (): CartItemOption[] =>
    options
      .filter(o => (optQty[o.id] ?? 0) > 0)
      .map(o => ({
        option_id: o.id,
        name_snapshot: getLocalizedOptionName(o, lang),
        quantity: optQty[o.id],
        unit_price: o.price,
      }));

  const handleDetailAddToCart = () => {
    if (!detailProduct) return;
    const selectedOptions = buildSelectedOptions();
    for (let i = 0; i < detailQty; i++) addItem(detailProduct, selectedOptions);
    toast.success(`${t.menu.detail.addToCart} ×${detailQty}`, { duration: 1500 });
    closeDetail();
  };

  const handleDetailBuyNow = () => {
    if (!detailProduct) return;
    const selectedOptions = buildSelectedOptions();
    for (let i = 0; i < detailQty; i++) addItem(detailProduct, selectedOptions);
    closeDetail();
    navigate('/checkout');
  };

  // 切分类 / 改排序后把列表回到顶部。滚动容器自己带 scroll-behavior:smooth，
  // 直接改 scrollTop 会做动画、看起来像没刷新，这里临时切成 auto 强制瞬时归位。
  const listScrollRef = useRef<HTMLElement | null>(null);
  const resetListScroll = useCallback(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = 0;
    el.style.scrollBehavior = prev;
  }, []);

  // 呼叫店员 → 连续点击 15 次（5 秒窗口）进入管理员入口
  const clickCountRef = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCallStaffPress = useCallback(() => {}, []);
  const handleCallStaffRelease = useCallback(() => {}, []);
  const handleCallStaffClick = useCallback(() => {
    if (clickCountRef.current === 0) toast.info('请呼叫身边店员', { duration: 2000 });
    clickCountRef.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { clickCountRef.current = 0; }, 5000);
    if (clickCountRef.current >= 15) {
      clickCountRef.current = 0;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      navigate('/admin/login', { state: { fromMenu: true } });
    }
  }, [navigate]);

  // 顾客端只显示可见分类；「全部」栏也只列属于可见分类的商品（隐藏分类＝停售归档）
  const visibleCategories = useMemo(() => categories.filter(c => c.is_visible !== false), [categories]);

  /**
   * 「全部」栏的展示顺序：按分类成块排列，分类顺序取后台 sort_order
   * （组合 → 咖啡 → 茶饮 → 甜点 → 手冲咖啡 → 其他），块内沿用各菜品的 sort_order。
   */
  const interleavedAll = useMemo(() => {
    const out: Product[] = [];
    for (const c of visibleCategories) {
      const items = products
        .filter(p => getProductCategoryIds(p).includes(c.id))
        .sort((a, b) => a.sort_order - b.sort_order);
      for (const p of items) if (!out.includes(p)) out.push(p);
    }
    return out;
  }, [products, visibleCategories]);

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return interleavedAll;
    return products.filter(p => productInCategory(p, activeCategory));
  }, [activeCategory, products, interleavedAll]);

  // 排序：默认沿用接口顺序（分类 + 后台配置的编号）；价格排序以编号作为同价时的稳定次序
  const sortedProducts = useMemo(() => {
    if (sortKey === 'default') return filtered;
    const dir = sortKey === 'priceAsc' ? 1 : -1;
    return [...filtered].sort((a, b) =>
      (Number(a.price) - Number(b.price)) * dir || a.sort_order - b.sort_order);
  }, [filtered, sortKey]);

  const getCartQty = (productId: string) =>
    items.find(i => i.product.id === productId)?.quantity ?? 0;

  const handleAddToCart = (product: Product) => addItem(product, []);

  const handleCheckout = () => {
    if (items.length === 0) { toast.warning(t.checkout.cartEmpty); return; }
    setCartOpen(false);
    navigate('/checkout');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4 loading-elegant">
          <Sparkles className="w-8 h-8 text-primary opacity-50" />
          <span className="text-base text-muted-foreground">{t.menu.loading}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="landscape-container page-enter">
      {/* ── 顶部栏 ── */}
      <header className="shrink-0 z-30 border-b"
        style={{ background: 'hsl(20 28% 6%)', borderColor: 'rgba(200,150,100,0.08)' }}>
        {/* 单行顶部：分类 + 排序 + 语言（购物车已移到右下角角标），整块只占一行高度 */}
        <div className="px-5 py-2 lg:px-8">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <div className="category-fade min-w-0 overflow-x-auto whitespace-nowrap sm:flex-1">
              <div className="inline-flex gap-2">
                <button onClick={() => { setActiveCategory('all'); resetListScroll(); }} className={`option-pill ${activeCategory === 'all' ? 'active' : ''}`}>
                  {t.menu.all}
                </button>
                {visibleCategories.map(cat => (
                  <button key={cat.id} onClick={() => { setActiveCategory(cat.id); resetListScroll(); }}
                    className={`option-pill ${activeCategory === cat.id ? 'active' : ''}`}>
                    {getLocalizedName(cat, lang)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
              <div className="sort-row flex items-center gap-1.5" role="group" aria-label={t.menu.sort.label}>
                <span className="sort-label hidden shrink-0 items-center gap-1.5 text-xs tracking-wider text-muted-foreground/70 lg:inline-flex">
                  <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  {t.menu.sort.label}
                </span>
                {SORT_KEYS.map(key => (
                  <button key={key} type="button"
                    aria-pressed={sortKey === key}
                    onClick={() => { setSortKey(key); resetListScroll(); }}
                    className={`sort-pill ${sortKey === key ? 'active' : ''}`}>
                    {t.menu.sort[key]}
                  </button>
                ))}
              </div>

              <button onClick={() => navigate('/lang')}
                className="ml-1 h-8 w-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
                style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.12)' }}
                title="Language / 言語 / 언어">
                <Languages className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 购物车抽屉：入口按钮已改为右下角穿透角标，这里保留内容结构，后续接回入口即可复用 */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetContent side="right" className="w-full max-w-md flex flex-col"
                style={{ background: 'hsl(20 26% 7%)', borderLeft: '1px solid rgba(200,150,100,0.08)', backdropFilter: 'blur(40px)' }}>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-foreground text-lg" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>
                    <ShoppingCart className="w-5 h-5 text-primary" />{t.menu.cartTitle}
                  </SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto py-3 min-h-0">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
                      <ShoppingCart className="w-10 h-10 opacity-20" />
                      <span className="text-base">{t.menu.cartEmpty}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 px-1">
                      {items.map((item, idx) => {
                        const optExtra = item.selectedOptions.reduce((s, o) => s + o.unit_price * o.quantity, 0);
                        const unitPrice = item.product.price + optExtra;
                        return (
                          <div key={`${item.product.id}-${idx}`} className="flex items-start gap-3">
                            <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 image-frame">
                              {item.product.image_url
                                ? <img src={item.product.image_url} alt={getLocalizedName(item.product, lang)} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center bg-muted"><UtensilsCrossed className="w-5 h-5 text-muted-foreground opacity-30" /></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-medium truncate text-foreground">{getLocalizedName(item.product, lang)}</p>
                              {item.selectedOptions.filter(o => o.quantity > 0).map(o => (
                                <p key={o.option_id} className="text-xs text-muted-foreground leading-relaxed">
                                  + {o.name_snapshot} ×{o.quantity}
                                  {o.unit_price > 0 && <span className="text-primary/70 ml-1">¥{(o.unit_price * o.quantity).toFixed(2)}</span>}
                                </p>
                              ))}
                              <p className="text-sm text-primary mt-0.5">¥{(unitPrice * item.quantity).toFixed(2)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground btn-press"
                                onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                                <Minus className="w-4 h-4" />
                              </Button>
                              <span className="text-base w-6 text-center text-foreground font-medium">{item.quantity}</span>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground btn-press"
                                onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                                <Plus className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive btn-press"
                                onClick={() => removeItem(item.product.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {items.length > 0 && (
                  <div className="pt-4 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(200,150,100,0.08)' }}>
                    <div className="tech-divider mb-1" />
                    <div className="flex items-center justify-between px-1">
                      <span className="text-base text-muted-foreground">{t.menu.cartTotal}</span>
                      <span className="text-2xl font-medium text-primary glow-number highlight-number">¥{totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="ghost" className="flex-1 h-12 text-base text-muted-foreground hover:text-foreground btn-press"
                        style={{ border: '1px solid rgba(200,150,100,0.10)' }}
                        onClick={() => { clearCart(); }}>
                        <Trash2 className="w-4 h-4 mr-2" />清空
                      </Button>
                      <Button className="flex-1 h-12 btn-primary-neon text-base font-medium" onClick={handleCheckout}>
                        {t.menu.checkout}
                      </Button>
                    </div>
                  </div>
                )}
        </SheetContent>
      </Sheet>

      {/* ── 商品网格 ── */}
      <main ref={listScrollRef} className="landscape-scroll px-5 py-3 lg:px-8 lg:py-4 container-landscape">
        {sortedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <UtensilsCrossed className="w-12 h-12 opacity-20" />
            <span className="text-base">{t.menu.noProducts}</span>
          </div>
        ) : (
          <div className="touch-grid">
            {sortedProducts.map(product => {
              const qty = getCartQty(product.id);
              const available = product.is_available;
              return (
                <div key={product.id}
                  className={`glass-card rounded-2xl overflow-hidden flex flex-col relative ${available ? 'cursor-pointer group' : 'opacity-50 pointer-events-none'}`}
                  onClick={() => available && openProduct(product)}>
                  <div className="aspect-[4/3] overflow-hidden image-frame relative">
                    {product.image_url
                      ? <img src={product.image_url} alt={getLocalizedName(product, lang)} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
                      : <div className="w-full h-full flex items-center justify-center bg-muted"><UtensilsCrossed className="w-10 h-10 text-muted-foreground opacity-25" /></div>}
                    {!available && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                        <span className="text-white text-lg font-bold px-5 py-2 rounded-xl bg-black/60 backdrop-blur-sm tracking-wider"
                          style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>
                          {t.menu.soldOut}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 lg:p-5 flex flex-col gap-1.5 flex-1 relative z-10">
                    <p className="text-base lg:text-lg font-medium text-foreground text-balance line-clamp-2 leading-snug"
                      style={{ fontFamily: "'Noto Serif SC','STSong',serif", letterSpacing: '0.04em' }}>
                      {getLocalizedName(product, lang)}
                    </p>
                    {getLocalizedDesc(product, lang) && (
                      <p className="text-sm lg:text-[0.95rem] text-muted-foreground line-clamp-1 leading-relaxed">{getLocalizedDesc(product, lang)}</p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2.5">
                      <span className="text-primary font-medium text-lg lg:text-xl highlight-number">¥{product.price.toFixed(2)}</span>
                      {comboProductIds.has(product.id) ? (
                        <Button size="sm" className="h-10 px-5 text-sm lg:h-11 lg:px-6 lg:text-base btn-primary-neon font-medium btn-press" style={{ borderRadius: '32px' }}
                          onClick={(e) => { e.stopPropagation(); openProduct(product); }}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />{comboTextOf(lang).select}
                        </Button>
                      ) : qty === 0 ? (
                        <Button size="sm" className="h-10 px-5 text-sm lg:h-11 lg:px-6 lg:text-base btn-primary-neon font-medium btn-press" style={{ borderRadius: '32px' }}
                          onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />{t.menu.addToCart}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-9 w-9 lg:h-10 lg:w-10 shrink-0 btn-press"
                            style={{ border: '1px solid rgba(200,150,100,0.12)', borderRadius: '10px' }}
                            onClick={() => updateQuantity(product.id, qty - 1)}>
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="text-base lg:text-lg w-7 lg:w-8 text-center font-medium text-foreground">{qty}</span>
                          <Button variant="ghost" size="icon" className="h-9 w-9 lg:h-10 lg:w-10 shrink-0 btn-press"
                            style={{ border: '1px solid rgba(200,150,100,0.12)', borderRadius: '10px' }}
                            onClick={() => handleAddToCart(product)}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 呼叫店员 */}
        <div className="mt-6 mb-4">
          <div className="tech-divider my-5" />
          <button className="w-full py-5 rounded-2xl flex items-center justify-center gap-3 text-muted-foreground hover:text-foreground transition-colors select-none cursor-pointer btn-press"
            style={{ border: '1px dashed rgba(200,150,100,0.12)', background: 'rgba(234,215,178,0.02)' }}
            onMouseDown={handleCallStaffPress} onMouseUp={handleCallStaffRelease}
            onTouchStart={handleCallStaffPress} onTouchEnd={handleCallStaffRelease}
            onClick={handleCallStaffClick}>
            <Phone className="w-5 h-5" />
            <span className="text-base">{t.menu.callStaff}</span>
          </button>
        </div>
      </main>

      {/* ── 右下角购物车栏 ──
          价格、去结算、购物车全部整合进这一条，只占右下角，不再横贯整屏遮挡视线。
          外层衬底 pointer-events:none（拖动/点击穿透到菜单），三个控件各自 auto。
          购物车为空时只显示购物车胶囊，按钮组整体隐藏。 */}
      <div
        className="pointer-events-none fixed right-0 bottom-0 z-20 flex items-end justify-end"
        style={{
          width: 'min(94vw, 720px)',
          padding: '0 16px calc(14px + env(safe-area-inset-bottom)) 0',
          background: 'linear-gradient(to left, rgba(16,11,7,0.98) 0%, rgba(16,11,7,0.88) 38%, rgba(16,11,7,0.42) 72%, rgba(16,11,7,0) 100%)',
          borderTopLeftRadius: '22px',
        }}>
        <div className="flex items-center gap-2.5">
          {totalCount > 0 && (
            <>
              <div className="pointer-events-auto flex items-center rounded-full h-11 px-5"
                style={{
                  background: 'linear-gradient(to right, rgba(20,14,10,0.96) 0%, rgba(20,14,10,0.72) 100%)',
                  border: '1px solid rgba(234,215,178,0.12)',
                }}>
                <span className="text-lg font-medium text-primary glow-number highlight-number whitespace-nowrap">¥{totalAmount.toFixed(2)}</span>
              </div>

              <button type="button" onClick={handleCheckout}
                className="pointer-events-auto btn-press shrink-0 h-11 px-6 sm:px-8 rounded-full text-base font-medium whitespace-nowrap"
                style={{
                  background: 'rgba(217,152,59,0.72)',
                  border: '1px solid rgba(245,190,100,0.55)',
                  color: 'hsl(24 40% 9%)',
                }}>
                {t.menu.checkout}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={t.menu.cartTitle}
            className="pointer-events-auto btn-press flex items-center gap-2 rounded-full pl-3.5 pr-4 h-11 text-foreground"
            style={{
              background: 'rgba(52,38,22,0.94)',
              border: '1px solid rgba(234,215,178,0.34)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            }}>
            <ShoppingCart className="w-4 h-4 text-primary" style={{ filter: 'drop-shadow(0 0 6px rgba(217,152,59,0.35))' }} />
            <span className="text-sm tracking-wide">{t.menu.cartTitle}</span>
            {totalCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                {totalCount > 99 ? '99+' : totalCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 套餐二级页面 ── */}
      {comboProduct && (() => {
        const groups = comboGroups
          .filter(g => g.product_id === comboProduct.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        if (groups.length === 0) return null;
        return (
          <ComboPage
            product={comboProduct}
            groups={groups}
            options={comboOptions}
            text={comboTextOf(lang)}
            lang={lang}
            onClose={() => setComboProduct(null)}
            onConfirm={handleComboConfirm}
          />
        );
      })()}

      {/* ── 商品详情弹窗 ── */}
      {detailProduct && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6"
          style={{ backdropFilter: 'blur(18px) saturate(110%)', WebkitBackdropFilter: 'blur(18px) saturate(110%)', background: 'transparent',
            animation: detailClosing ? 'fadeOut 0.24s ease forwards' : 'fadeIn 0.22s ease' }}
          onClick={closeDetail}>
          <div className="relative w-full md:max-w-2xl lg:max-w-3xl max-h-[92dvh] md:max-h-[88dvh] flex flex-col overflow-hidden"
            style={{ background: 'hsl(20 26% 7% / 0.96)', border: '1px solid rgba(234,215,178,0.10)', backdropFilter: 'blur(40px)',
              borderRadius: '24px 24px 0 0', boxShadow: '0 -8px 48px rgba(8,4,2,0.7), 0 0 0 1px rgba(234,215,178,0.06)',
              animation: detailClosing ? 'slideDownModal 0.26s cubic-bezier(0.4,0,1,1) forwards' : 'slideUpModal 0.28s cubic-bezier(0.22,1,0.36,1)' }}
            onClick={e => e.stopPropagation()}>

            {/* 关闭按钮 */}
            <button className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
              style={{ background: 'rgba(234,215,178,0.07)', border: '1px solid rgba(234,215,178,0.10)' }}
              onClick={closeDetail}>
              <X className="w-4 h-4" />
            </button>

            {/* 拖拽指示条（移动端）*/}
            <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(234,215,178,0.15)' }} />
            </div>

            {/* 内容区（可滚动）*/}
            <div className="overflow-y-auto flex-1 min-h-0">
              <div className="flex flex-col md:flex-row gap-0 md:gap-8 md:p-7">

                {/* 左列：封面图 + 详情段落 */}
                <div className="md:w-72 xl:w-80 shrink-0 flex flex-col gap-4">
                  <div className="aspect-[4/3] md:aspect-square md:rounded-2xl overflow-hidden image-frame">
                    {detailProduct.image_url
                      ? <img src={detailProduct.image_url} alt={getLocalizedName(detailProduct, lang)} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center bg-muted"><UtensilsCrossed className="w-16 h-16 text-muted-foreground opacity-20" /></div>}
                  </div>

                  {/* 详情段落（图片下方，左对齐）*/}
                  {(detailProduct.detail_sections ?? []).length > 0 && (
                    <div className="flex flex-col gap-3 px-5 md:px-0">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 rounded-full bg-primary" style={{ boxShadow: '0 0 8px rgba(217,152,59,0.4)' }} />
                        <span className="text-sm text-muted-foreground tracking-wider">{t.menu.detail.section}</span>
                      </div>
                      {detailProduct.detail_sections.map((sec, idx) =>
                        sec.type === 'image' ? (
                          <div key={idx} className="rounded-xl overflow-hidden image-frame">
                            <img src={sec.content} alt={`detail ${idx + 1}`} className="w-full object-cover" />
                          </div>
                        ) : (
                          <div key={idx} className="rounded-xl px-4 py-3"
                            style={{ background: 'rgba(234,215,178,0.04)', border: '1px solid rgba(200,150,100,0.08)' }}>
                            <p className="text-base text-foreground/85 leading-relaxed whitespace-pre-wrap">
                              {getLocalizedSectionContent(sec, lang)}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* 右侧信息 */}
                <div className="flex-1 min-w-0 flex flex-col gap-4 px-5 pt-5 pb-4 md:px-0 md:pt-0 md:pb-0">
                  {/* 名称 + 价格 */}
                  <div>
                    <h2 className="text-2xl text-foreground leading-snug mb-2"
                      style={{ fontFamily: "'Noto Serif SC','STSong',serif", letterSpacing: '0.04em' }}>
                      {getLocalizedName(detailProduct, lang)}
                    </h2>
                    {getLocalizedDesc(detailProduct, lang) && (
                      <p className="text-base text-muted-foreground leading-relaxed">{getLocalizedDesc(detailProduct, lang)}</p>
                    )}
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="text-3xl font-medium text-primary highlight-number"
                        style={{ textShadow: '0 0 20px rgba(217,152,59,0.20)' }}>
                        ¥{Number(detailProduct.price).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* 详情段落已移至左列图片下方，此处不再重复 */}

                  {/* ── 自定义选项 ── */}
                  {options.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 rounded-full bg-primary/60" style={{ boxShadow: '0 0 8px rgba(217,152,59,0.3)' }} />
                        <span className="text-sm text-muted-foreground tracking-wider">{t.menuOption.title}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {options.map(opt => {
                          const qty = optQty[opt.id] ?? 0;
                          const localName = getLocalizedOptionName(opt, lang);
                          return (
                            <div key={opt.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                              style={{
                                background: qty > 0 ? 'rgba(217,152,59,0.08)' : 'rgba(234,215,178,0.03)',
                                border: qty > 0 ? '1px solid rgba(217,152,59,0.25)' : '1px solid rgba(200,150,100,0.08)',
                              }}>
                              {/* 选项图片 */}
                              {opt.image_url && (
                                <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                                  <img src={opt.image_url} alt={localName} className="w-full h-full object-cover" />
                                </div>
                              )}
                              {/* 名称 + 价格 */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-foreground truncate">{localName}</p>
                                <p className="text-xs text-primary/80">
                                  {opt.price === 0 ? t.menuOption.free : `+¥${opt.price.toFixed(2)}`}
                                </p>
                              </div>
                              {/* 数量调节 */}
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                  style={{ border: '1px solid rgba(200,150,100,0.14)', background: 'rgba(234,215,178,0.04)' }}
                                  onClick={() => setOptQty(prev => ({ ...prev, [opt.id]: Math.max(0, (prev[opt.id] ?? 0) - 1) }))}>
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-base w-6 text-center font-medium text-foreground tabular-nums">{qty}</span>
                                <button
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                  style={{ border: '1px solid rgba(200,150,100,0.14)', background: 'rgba(234,215,178,0.04)' }}
                                  onClick={() => setOptQty(prev => ({ ...prev, [opt.id]: (prev[opt.id] ?? 0) + 1 }))}>
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 主商品数量选择 */}
                  <div className="flex items-center justify-between py-3"
                    style={{ borderTop: '1px solid rgba(200,150,100,0.08)' }}>
                    <span className="text-base text-foreground">{t.menu.detail.qty}</span>
                    <div className="flex items-center gap-3">
                      <button className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        style={{ border: '1px solid rgba(200,150,100,0.14)', background: 'rgba(234,215,178,0.04)' }}
                        onClick={() => setDetailQty(q => Math.max(1, q - 1))}>
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="text-xl font-medium text-foreground w-8 text-center tabular-nums">{detailQty}</span>
                      <button className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        style={{ border: '1px solid rgba(200,150,100,0.14)', background: 'rgba(234,215,178,0.04)' }}
                        onClick={() => setDetailQty(q => q + 1)}>
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 底部操作栏（固定）*/}
            <div className="shrink-0 flex gap-3 px-5 py-4 md:px-7 md:pb-6"
              style={{ borderTop: '1px solid rgba(200,150,100,0.08)', background: 'hsl(20 26% 7% / 0.98)' }}>
              <div className="flex items-center gap-1 mr-auto shrink-0">
                <span className="text-sm text-muted-foreground">{t.menu.detail.subtotal}</span>
                <span className="text-lg font-medium text-primary highlight-number ml-1">
                  ¥{detailSubtotal.toFixed(2)}
                </span>
              </div>
              <Button variant="ghost"
                className="h-12 px-5 text-base gap-2 btn-press shrink-0"
                style={{ border: '1px solid rgba(217,152,59,0.30)', background: 'rgba(217,152,59,0.07)', color: 'hsl(var(--primary))', borderRadius: '14px' }}
                onClick={handleDetailAddToCart}>
                <ShoppingCart className="w-4 h-4" />{t.menu.detail.addToCart}
              </Button>
              <Button className="h-12 px-5 text-base gap-2 btn-primary-neon btn-press shrink-0" onClick={handleDetailBuyNow}>
                <Zap className="w-4 h-4" />{t.menu.detail.buyNow}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
