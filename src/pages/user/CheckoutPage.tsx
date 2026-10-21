import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { PAYMENT_LABELS } from '@/i18n/translations';
import { ArrowLeft, Minus, Plus, Trash2, UtensilsCrossed, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cartLineKey, useCart } from '@/contexts/CartContext';
import { usePaymentConfig } from '@/hooks/useData';
import type { PaymentMethod } from '@/types/types';
import { PAYMENT_METHOD_LABELS, getLocalizedName } from '@/types/types';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { items, updateQuantity, removeItem, totalAmount } = useCart();
  const { config, loading: configLoading } = usePaymentConfig();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  // 结算页停留时预取付款页分包，点「去支付」后不用再等分包下载
  useEffect(() => { void import('@/pages/user/PaymentPage'); }, []);

  const availableMethods: PaymentMethod[] = [];
  if (config?.wechat_enabled) availableMethods.push('wechat');
  if (config?.alipay_enabled) availableMethods.push('alipay');
  if (config?.paypay_enabled) availableMethods.push('paypay');
  if (config?.cash_enabled) availableMethods.push('cash');

  const handleSubmit = () => {
    if (items.length === 0) { toast.warning(t.checkout.cartEmpty); navigate('/'); return; }
    if (!paymentMethod) { toast.warning(t.checkout.selectPaymentWarn); return; }
    navigate('/payment', { state: { paymentMethod } });
  };

  if (items.length === 0) { navigate('/'); return null; }

  return (
    <div className="app-page bg-background page-enter">
      <div className="max-w-3xl mx-auto px-5 py-6 md:px-8 md:py-8 flex flex-col gap-5">

        {/* 返回 */}
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-base group">
          <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          {t.checkout.back}
        </button>

        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary" style={{ filter: 'drop-shadow(0 0 6px rgba(217,152,59,0.35))' }} />
          <h1 className="text-2xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>
            {t.checkout.title}
          </h1>
        </div>

        {/* 订单商品 */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(200,150,100,0.08)' }}>
            <UtensilsCrossed className="w-4 h-4 text-primary opacity-60" />
            <span className="text-base font-medium text-foreground">{t.checkout.orderItems}</span>
          </div>
          <div>
            {items.map((item, idx) => {
              const optExtra = item.selectedOptions.reduce((s, o) => s + o.unit_price * o.quantity, 0);
              const unitPrice = item.product.price + optExtra;
              return (
                <div key={`${item.product.id}-${idx}`} className="flex items-start gap-3 px-5 py-4"
                  style={{ borderBottom: '1px solid rgba(200,150,100,0.05)' }}>
                  <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden shrink-0 image-frame">
                    {item.product.image_url ? (
                      <img src={item.product.image_url} alt={getLocalizedName(item.product, lang)} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UtensilsCrossed className="w-5 h-5 text-muted-foreground opacity-30" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <p className="text-base font-medium truncate text-foreground">{getLocalizedName(item.product, lang)}</p>
                    {/* 已选选项明细 */}
                    {item.selectedOptions.filter(o => o.quantity > 0).map(o => (
                      <p key={o.option_id} className="text-xs text-muted-foreground leading-relaxed">
                        + {o.name_snapshot} ×{o.quantity}
                        {o.unit_price > 0 && (
                          <span className="text-primary/70 ml-1">¥{(o.unit_price * o.quantity).toFixed(2)}</span>
                        )}
                      </p>
                    ))}
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-sm text-primary shrink-0">¥{(unitPrice * item.quantity).toFixed(2)}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-9 w-9 btn-press"
                          onClick={() => updateQuantity(cartLineKey(item), item.quantity - 1)}>
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="text-base w-7 text-center text-foreground">{item.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-9 w-9 btn-press"
                          onClick={() => updateQuantity(cartLineKey(item), item.quantity + 1)}>
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive btn-press"
                          onClick={() => removeItem(cartLineKey(item))}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-4 flex justify-between items-center" style={{ borderTop: '1px solid rgba(200,150,100,0.08)' }}>
            <span className="text-base text-muted-foreground">{t.checkout.total}</span>
            <span className="text-2xl font-medium text-primary glow-number highlight-number">¥{totalAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* 支付方式 */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(200,150,100,0.08)' }}>
            <span className="text-base font-medium text-foreground">{t.checkout.selectPayment}</span>
          </div>
          <div className="px-5 py-4">
            {configLoading ? (
              <div className="text-base text-muted-foreground loading-elegant py-2">{t.checkout.loadingPayment}</div>
            ) : availableMethods.length === 0 ? (
              <div className="text-base text-muted-foreground py-2">{t.checkout.noPayment}</div>
            ) : (
              <RadioGroup value={paymentMethod ?? ''} onValueChange={v => setPaymentMethod(v as PaymentMethod)} className="flex flex-col gap-3">
                {availableMethods.map(method => (
                  <div key={method}
                    className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all cursor-pointer touch-target ${paymentMethod === method ? 'glass-card--active' : ''}`}
                    style={{
                      border: paymentMethod === method ? '1px solid rgba(217,152,59,0.40)' : '1px solid rgba(200,150,100,0.08)',
                      background: paymentMethod === method ? 'rgba(217,152,59,0.10)' : 'rgba(234,215,178,0.025)'
                    }}
                    onClick={() => setPaymentMethod(method)}>
                    <RadioGroupItem value={method} id={method} />
                    <Label htmlFor={method} className="cursor-pointer text-base flex-1 text-foreground">
                      {PAYMENT_LABELS[lang][method]}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>
        </div>

        {/* 提交按钮 */}
        <Button
          className="w-full h-14 bg-primary text-primary-foreground hover:bg-secondary text-lg font-medium rounded-2xl btn-press"
          onClick={handleSubmit}
          disabled={!paymentMethod}
          style={!paymentMethod ? {
            opacity: 0.5, background: 'rgba(180,120,60,0.3)', border: '1px solid rgba(200,150,100,0.12)'
          } : {
            boxShadow: '0 4px 16px rgba(8,4,2,0.35), 0 0 20px rgba(217,152,59,0.10)'
          }}>
          <Sparkles className="w-5 h-5 mr-2" />
          {t.checkout.submit}
        </Button>
      </div>
    </div>
  );
}
