import { useState, useEffect, useCallback } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useDisplayOrders } from '@/hooks/useData';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Order } from '@/types/types';

function OrderCard({ order }: { order: Order }) {
  return (
    <div className="glass-card rounded-2xl p-6 flex items-center justify-center overflow-hidden">
      <span className="display-order-number">
        {order.order_number.split('-').slice(-1)[0]}
      </span>
    </div>
  );
}

function DisplayContent({
  makingOrders,
  readyOrders,
  loading,
  isFullscreen,
  onEnter,
  onExit,
}: {
  makingOrders: Order[];
  readyOrders: Order[];
  loading: boolean;
  isFullscreen: boolean;
  onEnter: () => void;
  onExit: () => void;
}) {
  const { t } = useLanguage();
  const td = t.adminDisplay;

  return (
    <div className={`flex flex-col bg-background ${isFullscreen ? 'fixed inset-0 z-[9999]' : 'min-h-full'}`}>
      <div className="ambient-lights" aria-hidden="true">
        <div className="ambient-light bokeh--gold-mid" />
        <div className="ambient-light bokeh--cream-soft" />
        <div className="ambient-light bokeh--copper-small" />
      </div>

      <div
        className={`relative z-10 flex items-center justify-between px-6 py-4 lg:px-8 transition-opacity duration-300 ${
          isFullscreen ? 'opacity-0 hover:opacity-100' : ''
        }`}
        style={{
          background: 'hsl(20 28% 5% / 0.90)',
          backdropFilter: 'blur(32px)',
          borderBottom: '1px solid rgba(200,150,100,0.08)',
        }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-foreground text-2xl tracking-wider"
            style={{ fontFamily: "'Noto Serif SC','STSong',serif", letterSpacing: '0.08em' }}>
            {td.title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!isFullscreen && (
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"
                style={{ boxShadow: '0 0 6px rgba(217,152,59,0.5)' }} />
              3s
            </span>
          )}
          <button
            onClick={isFullscreen ? onExit : onEnter}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
            style={{ border: '1px solid rgba(234,215,178,0.10)', background: 'rgba(234,215,178,0.04)' }}
          >
            {isFullscreen
              ? <><Minimize2 className="w-4 h-4" /><span>{td.exitFullscreen}</span></>
              : <><Maximize2 className="w-4 h-4" /><span className="hidden md:inline">{td.fullscreen}</span></>
            }
          </button>
        </div>
      </div>

      {loading && makingOrders.length === 0 && readyOrders.length === 0 ? (
        <div className="relative z-10 flex-1 flex items-center justify-center text-muted-foreground loading-elegant text-base">
          {td.emptyMaking}
        </div>
      ) : (
        <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-2 gap-0"
          style={{ borderTop: '1px solid rgba(200,150,100,0.05)' }}>
          {/* 正在制作 */}
          <div className="flex flex-col p-6 lg:p-8 gap-5"
            style={{ borderRight: '1px solid rgba(200,150,100,0.06)' }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full animate-breathe"
                  style={{ background: 'hsl(210 72% 55%)', boxShadow: '0 0 8px rgba(90,150,240,0.4)' }} />
                <span className="text-foreground/85 text-lg font-medium">{td.making}</span>
              </div>
              <span className="ml-auto text-muted-foreground text-base">{makingOrders.length}</span>
            </div>
            {makingOrders.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground/35 text-base py-20">
                {td.emptyMaking}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {makingOrders.map(order => <OrderCard key={order.id} order={order} />)}
              </div>
            )}
          </div>

          {/* 待领取 */}
          <div className="flex flex-col p-6 lg:p-8 gap-5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full animate-pulse-glow"
                  style={{ background: 'hsl(36 74% 60%)', boxShadow: '0 0 10px rgba(217,152,59,0.55)' }} />
                <span className="text-foreground/85 text-lg font-medium">{td.ready}</span>
              </div>
              <span className="ml-auto text-muted-foreground text-base">{readyOrders.length}</span>
            </div>
            {readyOrders.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground/35 text-base py-20">
                {td.emptyReady}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {readyOrders.map(order => (
                  <div key={order.id} className="relative overflow-hidden rounded-2xl p-6 flex items-center justify-center animate-pulse-glow"
                    style={{
                      background: 'rgba(217,152,59,0.10)',
                      border: '1px solid rgba(217,152,59,0.32)',
                      boxShadow: '0 0 24px rgba(217,152,59,0.08)',
                    }}>
                    <span className="display-order-number text-primary glow-number">
                      {order.order_number.split('-').slice(-1)[0]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {makingOrders.length === 0 && readyOrders.length === 0 && !loading && (
        <div className="relative z-10 pb-8 text-center text-muted-foreground/35 text-base">
          {td.emptyMaking}
        </div>
      )}
    </div>
  );
}

export default function AdminDisplayPage() {
  const { orders, loading } = useDisplayOrders();
  // 桌面出餐屏用 /admin/display?kiosk=1 启动：一进来就是全屏展示，不用每次手点「全屏」
  const [isFullscreen, setIsFullscreen] = useState(
    () => new URLSearchParams(window.location.search).get('kiosk') === '1',
  );

  const makingOrders = orders.filter(o => o.status === 'making');
  const readyOrders  = orders.filter(o => o.status === 'ready');

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const enter = useCallback(() => setIsFullscreen(true),  []);
  const exit  = useCallback(() => setIsFullscreen(false), []);

  return (
    <DisplayContent
      makingOrders={makingOrders}
      readyOrders={readyOrders}
      loading={loading}
      isFullscreen={isFullscreen}
      onEnter={enter}
      onExit={exit}
    />
  );
}
