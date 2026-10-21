import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { CheckCircle2, Timer, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Order } from '@/types/types';

export default function OrderSuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const order = (location.state as { order?: Order })?.order;
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (!order) {
      navigate('/', { replace: true });
      return;
    }
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [order, navigate]);

  if (!order) return null;

  return (
    <div className="app-page bg-background flex items-center justify-center px-6 page-enter">
      <div className="w-full max-w-md flex flex-col items-center gap-8 text-center">

        <div className="w-28 h-28 rounded-full flex items-center justify-center animate-pulse-glow"
          style={{
            background: 'rgba(217,152,59,0.08)',
            border: '1px solid rgba(217,152,59,0.35)',
            boxShadow: '0 0 40px rgba(217,152,59,0.12), 0 0 80px rgba(217,152,59,0.05)',
          }}>
          <CheckCircle2 className="w-14 h-14 text-primary"
            style={{ filter: 'drop-shadow(0 0 8px rgba(217,152,59,0.5))' }} />
        </div>

        <div>
          <h1 className="text-3xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>
            {t.success.title}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Sparkles className="w-4 h-4 text-primary opacity-60" />
            <p className="text-base text-muted-foreground">{t.success.subtitle}</p>
          </div>
        </div>

        <div className="w-full glass-card rounded-2xl p-6 text-left flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-base text-muted-foreground">{t.success.orderNumber}</span>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xl font-mono font-bold tracking-widest text-primary">{order.order_number.slice(-4)}</span>
              <span className="text-xs font-mono text-muted-foreground opacity-60">{order.order_number}</span>
            </div>
          </div>
          <div className="tech-divider" />
          <div className="flex justify-between items-center">
            <span className="text-base text-muted-foreground">{t.success.orderStatus}</span>
            <span className="text-sm px-3 py-1 rounded-full status-pending">{t.success.statusPending}</span>
          </div>
          <div className="tech-divider" />
          <div className="flex justify-between items-center">
            <span className="text-base text-muted-foreground">{t.success.amount}</span>
            <span className="text-2xl font-medium text-primary glow-number highlight-number">
              ¥{Number(order.total_amount).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 text-base text-muted-foreground text-center leading-relaxed w-full">
          {t.success.tip}
        </div>

        <div className="flex flex-col items-center gap-4 w-full">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="w-4 h-4" />
            <span>{countdown} {t.success.countdown}</span>
          </div>
          <Button
            className="w-full h-14 bg-primary text-primary-foreground hover:bg-secondary text-lg font-medium rounded-2xl gap-2 btn-press"
            style={{ boxShadow: '0 4px 16px rgba(8,4,2,0.35), 0 0 20px rgba(217,152,59,0.10)' }}
            onClick={() => navigate('/', { replace: true })}
          >
            <CheckCircle2 className="w-5 h-5" />
            {t.success.backHome}
          </Button>
        </div>
      </div>
    </div>
  );
}
