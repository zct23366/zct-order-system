import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { PAYMENT_LABELS } from '@/i18n/translations';
import { ArrowLeft, CheckCircle, CheckCircle2, Banknote, Sparkles, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import { usePaymentConfig } from '@/hooks/useData';
import { BUNDLED_PAYMENT_QR, loadRemotePaymentQr } from '@/lib/paymentQr';
import { createOrder, fetchJpyToCnyRate } from '@/services/api';
import type { PaymentMethod, Order, PaymentConfig } from '@/types/types';

/** 只取订单号末4位，用于大字展示 */
function shortNum(n: string) { return n.slice(-4); }

// ── 订单号展示覆盖层 ──
function OrderNumberOverlay({ order, onDone }: { order: Order; onDone: () => void }) {
  const { t } = useLanguage();
  const tp = t.payment;
  const [autoCount, setAutoCount] = useState(10);
  const [confirmed, setConfirmed] = useState(false);
  const [returnCount, setReturnCount] = useState(3);

  // 10秒自动倒计时
  useEffect(() => {
    if (confirmed) return;
    if (autoCount <= 0) { onDone(); return; }
    const id = setTimeout(() => setAutoCount(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [autoCount, confirmed, onDone]);

  // 点击确认后3秒倒计时
  useEffect(() => {
    if (!confirmed) return;
    if (returnCount <= 0) { onDone(); return; }
    const id = setTimeout(() => setReturnCount(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [confirmed, returnCount, onDone]);

  const handleConfirm = useCallback(() => setConfirmed(true), []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 page-enter"
      style={{
        background: 'hsl(20 22% 6% / 0.97)',
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* 装饰光斑 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-20 animate-pulse-glow"
          style={{ background: 'radial-gradient(circle, rgba(217,152,59,0.25) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8 text-center">
        {/* 图标 */}
        <div className="w-20 h-20 rounded-full flex items-center justify-center animate-pulse-glow"
          style={{ background: 'rgba(217,152,59,0.10)', border: '1px solid rgba(217,152,59,0.40)', boxShadow: '0 0 40px rgba(217,152,59,0.15)' }}>
          <BookmarkCheck className="w-10 h-10 text-primary"
            style={{ filter: 'drop-shadow(0 0 10px rgba(217,152,59,0.6))' }} />
        </div>

        {/* 标题 */}
        <div className="flex flex-col gap-2">
          <p className="text-base text-muted-foreground tracking-widest uppercase" style={{ letterSpacing: '0.14em' }}>
            {tp.orderNumTitle}
          </p>
          {/* 超大订单号末4位 */}
          <div className="relative flex flex-col items-center gap-1">
            <p
              className="font-mono font-bold text-primary leading-none tracking-widest"
              style={{
                fontSize: 'clamp(4rem, 20vw, 7rem)',
                filter: 'drop-shadow(0 0 24px rgba(217,152,59,0.60))',
                letterSpacing: '0.12em',
              }}
            >
              {shortNum(order.order_number)}
            </p>
            <p className="text-xs font-mono text-muted-foreground tracking-widest opacity-60">
              {order.order_number}
            </p>
          </div>
        </div>

        {/* 保存提示 */}
        <div className="glass-card rounded-2xl px-6 py-4 flex items-start gap-3 text-left w-full">
          <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5 opacity-70" />
          <p className="text-sm text-muted-foreground leading-relaxed">{tp.orderNumSave}</p>
        </div>

        {/* 确认按钮 / 返回倒计时 */}
        {!confirmed ? (
          <div className="flex flex-col items-center gap-4 w-full">
            <Button
              className="w-full h-14 bg-primary text-primary-foreground hover:bg-secondary text-lg font-medium rounded-2xl gap-2 btn-press"
              style={{ boxShadow: '0 4px 16px rgba(8,4,2,0.35), 0 0 20px rgba(217,152,59,0.12)' }}
              onClick={handleConfirm}
            >
              <CheckCircle2 className="w-5 h-5" />
              {tp.orderNumConfirm}
            </Button>
            <p className="text-sm text-muted-foreground">
              {autoCount} {tp.orderNumReturning}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full border-2 border-primary/40 flex items-center justify-center animate-pulse-glow">
              <span className="text-2xl font-mono font-bold text-primary">{returnCount}</span>
            </div>
            <p className="text-base text-muted-foreground">{tp.orderNumReturning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useLanguage();
  const { items, totalAmount, clearCart } = useCart();
  const { config, loading: configLoading } = usePaymentConfig();

  const paymentMethod = (location.state as { paymentMethod?: PaymentMethod })?.paymentMethod;
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  // 微信 / 支付宝按人民币收款：实时抓日元→人民币汇率（1 小时缓存），往上取整
  const isCnyPayment = paymentMethod === 'wechat' || paymentMethod === 'alipay';
  const [cnyRate, setCnyRate] = useState<number | null>(null);

  useEffect(() => {
    if (!isCnyPayment) return;
    let alive = true;
    fetchJpyToCnyRate()
      .then(rate => {
        if (!alive) return;
        if (rate) {
          setCnyRate(rate);
          return;
        }
        // 在线汇率拿不到时用配置里的值兜底；配置值量纲不对（如 4.3）就退回 0.05
        const key = `${paymentMethod}_rate` as keyof PaymentConfig;
        const fallback = Number(config?.[key] ?? 0);
        setCnyRate(fallback > 0 && fallback < 1 ? fallback : 0.05);
      })
      .catch(() => { /* 兜底同上，保持页面可用 */ });
    return () => { alive = false; };
  }, [isCnyPayment, paymentMethod, config]);

  const cnyAmount = cnyRate ? Math.ceil(totalAmount * cnyRate) : null;

  useEffect(() => {
    if (confirmedOrder) return; // 已提交成功，不再守卫跳转
    if (!paymentMethod || items.length === 0) {
      navigate('/');
    }
  }, [paymentMethod, items.length, confirmedOrder, navigate]);

  const bundledQr = paymentMethod ? BUNDLED_PAYMENT_QR[paymentMethod] : undefined;
  const remoteQrUrl = (() => {
    if (!paymentMethod || !config) return null;
    if (paymentMethod === 'wechat') return config.wechat_qrcode_url;
    if (paymentMethod === 'alipay') return config.alipay_qrcode_url;
    if (paymentMethod === 'paypay') return config.paypay_qrcode_url;
    return null;
  })();

  // 后台换了二维码（远程地址与打包图不同）时，先看本地缓存、没有再下载，拿到后替换打包图
  const [loadedRemoteQr, setLoadedRemoteQr] = useState<{ url: string; src: string } | null>(null);
  useEffect(() => {
    if (!remoteQrUrl || !bundledQr || remoteQrUrl === bundledQr.sourceUrl) return;
    let alive = true;
    let objectUrl: string | null = null;
    loadRemotePaymentQr(remoteQrUrl).then(src => {
      if (!src) return;
      if (!alive) { URL.revokeObjectURL(src); return; }
      objectUrl = src;
      setLoadedRemoteQr({ url: remoteQrUrl, src });
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [remoteQrUrl, bundledQr]);

  // 打包图先顶上：不等配置查询、不等外部 CDN，付完款立刻能看到码
  const qrSrc = (() => {
    if (!paymentMethod) return null;
    if (configLoading) return bundledQr?.src ?? null;
    if (!remoteQrUrl) return null;                                  // 后台清空/未配置
    if (!bundledQr) return remoteQrUrl;                             // 没有打包图的支付方式照旧用远程
    if (remoteQrUrl === bundledQr.sourceUrl) return bundledQr.src;   // 后台还是这张：直接用打包图
    return loadedRemoteQr?.url === remoteQrUrl ? loadedRemoteQr.src : bundledQr.src;
  })();

  const handlePaid = async () => {
    if (submitting || !paymentMethod) return;
    setSubmitting(true);
    try {
      const order = await createOrder(items, totalAmount, paymentMethod, lang);
      const { updateOrderStatus } = await import('@/services/api');
      await updateOrderStatus(order.id, 'pending_payment');
      clearCart();
      setConfirmedOrder({ ...order, status: 'pending_payment' });
    } catch {
      toast.error(t.payment.submitting);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverlayDone = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  if (!paymentMethod) return null;

  const methodLabel = PAYMENT_LABELS[lang][paymentMethod];

  return (
    <div className="app-page bg-background page-enter">
      {/* 订单号覆盖层 */}
      {confirmedOrder && (
        <OrderNumberOverlay order={confirmedOrder} onDone={handleOverlayDone} />
      )}
      <div className="max-w-xl mx-auto px-5 py-6 md:px-8 md:py-8 flex flex-col gap-6">
        {/* 返回 */}
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-base group">
          <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          {t.payment.back}
        </button>

        <div className="text-center">
          <Sparkles className="w-8 h-8 text-primary mx-auto mb-3"
            style={{ filter: 'drop-shadow(0 0 8px rgba(217,152,59,0.4))' }} />
          <h1 className="text-2xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>
            {t.payment.title}
          </h1>
          <p className="text-base text-muted-foreground mt-1.5">{methodLabel}</p>
        </div>

        {/* 金额：微信/支付宝显示人民币（大字）+ 日元（小字），其余显示日元 */}
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-sm text-muted-foreground mb-2 tracking-widest" style={{ letterSpacing: '0.12em' }}>
            {t.payment.amount}
          </p>
          {isCnyPayment && cnyAmount !== null ? (
            <>
              <p className="text-4xl md:text-6xl font-medium text-primary glow-number highlight-number tracking-tight">
                ¥{cnyAmount}
                <span className="text-base md:text-xl text-muted-foreground font-normal ml-2 align-middle">CNY</span>
              </p>
              <p className="text-sm md:text-base text-muted-foreground mt-3">
                ≈ ¥{totalAmount.toFixed(0)} <span className="opacity-70">JPY</span>
              </p>
            </>
          ) : (
            <p className="text-4xl md:text-6xl font-medium text-primary glow-number highlight-number tracking-tight">
              ¥{totalAmount.toFixed(2)}
              <span className="text-base md:text-xl text-muted-foreground font-normal ml-2 align-middle">JPY</span>
            </p>
          )}
        </div>

        {/* 二维码 / 现金 */}
        {paymentMethod === 'cash' ? (
          <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-4">
            <Banknote className="w-20 h-20 text-primary opacity-75"
              style={{ filter: 'drop-shadow(0 0 12px rgba(217,152,59,0.2))' }} />
            <p className="text-lg font-medium text-foreground">{t.payment.cashTitle}</p>
            <p className="text-base text-muted-foreground text-center leading-relaxed">
              {t.payment.cashDesc}{' '}
              <span className="text-primary font-medium text-xl glow-number">¥{totalAmount.toFixed(2)}</span>
              {' '}{t.payment.cashDescSuffix}
            </p>
          </div>
        ) : qrSrc ? (
          <div className="glass-card rounded-2xl p-8 flex flex-col items-center gap-4">
            <div className="w-full max-w-[14rem] aspect-square mx-auto rounded-2xl overflow-hidden image-frame bg-white/5 p-3">
              <img
                src={qrSrc}
                alt={`${methodLabel} QR`}
                width={224}
                height={224}
                decoding="async"
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-base text-muted-foreground">
              {t.payment.scanHint}{t.payment.scanHint ? ' ' : ''}{methodLabel}{t.payment.scanHintSuffix}
            </p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-4 text-muted-foreground">
            <div className="w-full max-w-[14rem] aspect-square mx-auto bg-muted rounded-2xl flex items-center justify-center">
              <span className="text-base">{t.payment.noQr}</span>
            </div>
            <p className="text-base text-center">{t.payment.noQrHint}</p>
          </div>
        )}

        {/* 已支付按钮 */}
        <Button
          className="w-full h-14 bg-primary text-primary-foreground hover:bg-secondary text-lg font-medium rounded-2xl gap-2 btn-press"
          style={{ boxShadow: '0 4px 16px rgba(8,4,2,0.35), 0 0 20px rgba(217,152,59,0.10)' }}
          onClick={handlePaid}
          disabled={submitting}
        >
          <CheckCircle className="w-6 h-6" />
          {submitting ? t.payment.submitting : t.payment.paid}
        </Button>

        <p className="text-sm text-muted-foreground text-center leading-relaxed">{t.payment.hint}</p>
      </div>
    </div>
  );
}
