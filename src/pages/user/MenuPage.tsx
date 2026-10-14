import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, UtensilsCrossed, Phone, Sparkles, X, Zap, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import { useMenu } from '@/hooks/useData';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Product, ProductOption, CartItemOption } from '@/types/types';
import { getLocalizedName, getLocalizedDesc, getLocalizedOptionName, getLocalizedSectionContent, productInCategory, getProductCategoryIds } from '@/types/types';
import { fetchProductOptions } from '@/services/api';

export default function MenuPage() {
  const navigate = useNavigate();
  const { t, lang, setLang } = useLanguage();
  const { categories, products, loading } = useMenu();
  const { items, addItem, removeItem, updateQuantity, clearCart, totalAmount, totalCount } = useCart();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [cartOpen, setCartOpen] = useState(false);

  // ── 商品详情弹窗状态 ──
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [detailClosing, setDetailClosing] = useState(false);

  // ── 自定义选项状态 ──
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [optQty, setOptQty] = useState<Record<string, number>>({}); // optionId → qty

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

  useEffect(() => {
    if (detailProduct) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [detailProduct]);

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
  const visibleCategories = categories.filter(c => c.is_visible !== false);
  const visibleCategoryIds = new Set(visibleCategories.map(c => c.id));
  const filtered = activeCategory === 'all'
    ? products.filter(p => getProductCategoryIds(p).some(cid => visibleCategoryIds.has(cid)))
    : products.filter(p => productInCategory(p, activeCategory));

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
        style={{ background: 'hsl(20 28% 5% / 0.92)', backdropFilter: 'blur(32px)', borderColor: 'rgba(200,150,100,0.08)' }}>
        <div className="flex items-center gap-2 justify-between px-5 py-3.5 lg:px-8 lg:py-4 container-landscape">
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
            <div className="relative shrink-0">
              <UtensilsCrossed className="w-6 h-6 text-primary" style={{ filter: 'drop-shadow(0 0 8px rgba(217,152,59,0.4))' }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl text-foreground tracking-wider truncate"
                style={{ fontFamily: "'Noto Serif SC','STSong','Songti SC',serif", letterSpacing: '0.08em' }}>
                {t.appTitle}
              </h1>
              <p className="text-xs text-muted-foreground tracking-widest hidden lg:block" style={{ letterSpacing: '0.12em' }}>
                {t.appSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigate('/lang')}
              className="h-10 w-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
              style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.12)' }}
              title="Language / 言語 / 언어">
              <Languages className="w-4 h-4" />
            </button>

            <Sheet open={cartOpen} onOpenChange={setCartOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost"
                  className="relative h-12 px-5 gap-2.5 text-foreground btn-press"
                  style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.14)', borderRadius: '48px', backdropFilter: 'blur(20px)' }}>
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  <span className="hidden md:inline text-base">{t.menu.cartTitle}</span>
                  {totalCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-6 w-6 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground border-0 badge-bounce">
                      {totalCount > 99 ? '99+' : totalCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
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
          </div>
        </div>
        <div className="overflow-x-auto whitespace-nowrap px-5 pb-3.5 lg:px-8">
          <div className="inline-flex gap-2.5">
            <button onClick={() => setActiveCategory('all')} className={`option-pill ${activeCategory === 'all' ? 'active' : ''}`}>
              {t.menu.all}
            </button>
            {visibleCategories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`option-pill ${activeCategory === cat.id ? 'active' : ''}`}>
                {getLocalizedName(cat, lang)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── 商品网格 ── */}
      <main className="landscape-scroll px-5 py-5 lg:px-8 lg:py-6 container-landscape">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <UtensilsCrossed className="w-12 h-12 opacity-20" />
            <span className="text-base">{t.menu.noProducts}</span>
          </div>
        ) : (
          <div className="touch-grid">
            {filtered.map(product => {
              const qty = getCartQty(product.id);
              const available = product.is_available;
              return (
                <div key={product.id}
                  className={`glass-card rounded-2xl overflow-hidden flex flex-col relative ${available ? 'cursor-pointer group' : 'opacity-50 pointer-events-none'}`}
                  onClick={() => available && openDetail(product)}>
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
                  <div className="p-4 flex flex-col gap-1.5 flex-1 relative z-10">
                    <p className="text-base font-medium text-foreground text-balance line-clamp-2 leading-snug"
                      style={{ fontFamily: "'Noto Serif SC','STSong',serif", letterSpacing: '0.04em' }}>
                      {getLocalizedName(product, lang)}
                    </p>
                    {getLocalizedDesc(product, lang) && (
                      <p className="text-sm text-muted-foreground line-clamp-1 leading-relaxed">{getLocalizedDesc(product, lang)}</p>
                    )}
                    <div className="flex items-center justify-between mt-auto pt-2.5">
                      <span className="text-primary font-medium text-lg highlight-number">¥{product.price.toFixed(2)}</span>
                      {qty === 0 ? (
                        <Button size="sm" className="h-10 px-5 text-sm btn-primary-neon font-medium btn-press" style={{ borderRadius: '32px' }}
                          onClick={(e) => { e.stopPropagation(); handleAddToCart(product); }}>
                          <Plus className="w-3.5 h-3.5 mr-1.5" />{t.menu.addToCart}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 btn-press"
                            style={{ border: '1px solid rgba(200,150,100,0.12)', borderRadius: '10px' }}
                            onClick={() => updateQuantity(product.id, qty - 1)}>
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <span className="text-base w-7 text-center font-medium text-foreground">{qty}</span>
                          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 btn-press"
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

      {/* ── 底部悬浮结算栏 ── */}
      {totalCount > 0 && (
        <div className="sticky bottom-0 shrink-0 px-5 py-3.5 lg:px-8"
          style={{ background: 'hsl(20 28% 5% / 0.94)', backdropFilter: 'blur(32px)', borderTop: '1px solid rgba(200,150,100,0.08)', paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between container-landscape gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <ShoppingCart className="w-6 h-6 text-primary" style={{ filter: 'drop-shadow(0 0 6px rgba(217,152,59,0.3))' }} />
                <span className="absolute -top-2 -right-3 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium"
                  style={{ boxShadow: '0 0 8px rgba(217,152,59,0.2)' }}>
                  {totalCount}
                </span>
              </div>
              <span className="text-xl font-medium text-primary glow-number highlight-number">¥{totalAmount.toFixed(2)}</span>
            </div>
            <Button className="btn-primary-neon flex-1 max-w-xs h-12 text-base font-medium" onClick={handleCheckout}>
              {t.menu.checkout}
            </Button>
          </div>
        </div>
      )}

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
