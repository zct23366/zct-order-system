import { useEffect, useRef, useState, useCallback } from 'react';
import { Printer, Wifi, WifiOff, RefreshCw, CheckCircle2, Clock, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { fetchOrderWithItems } from '@/services/api';
import { usePrintConfig } from '@/hooks/useData';
import { usePrint } from '@/hooks/usePrint';
import { usePendingPayment } from '@/hooks/use-pending-payment';
import { PAYMENT_METHOD_LABELS } from '@/types/types';
import type { OrderWithItems } from '@/types/types';

interface PrintRecord {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  printedAt: Date;
  itemCount: number;
}

type ConnState = 'connecting' | 'connected' | 'disconnected';

export default function AdminPrintStationPage() {
  const { config: printConfig, reload: reloadConfig } = usePrintConfig();
  const { printOrder } = usePrint(printConfig);
  // 顾客停在付款页时的待支付金额：10 秒收不到心跳就自动消失
  const pendingPayment = usePendingPayment();

  const [connState, setConnState] = useState<ConnState>('connecting');
  const [printRecords, setPrintRecords] = useState<PrintRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [localAuto, setLocalAuto] = useState(printConfig.print_auto);

  // 同步远端配置到本地
  useEffect(() => { setLocalAuto(printConfig.print_auto); }, [printConfig.print_auto]);

  // 已处理的订单 ID 集合（防止重复打印）
  const printedIds = useRef<Set<string>>(new Set());

  const handleNewPendingOrder = useCallback(async (orderId: string, orderNumber: string) => {
    if (printedIds.current.has(orderId)) return;
    printedIds.current.add(orderId);

    setPendingCount(c => c + 1);

    try {
      const detail = await fetchOrderWithItems(orderId);
      if (!detail) return;

      setPendingCount(c => Math.max(0, c - 1));

      // 添加到打印记录
      const record: PrintRecord = {
        orderId,
        orderNumber,
        totalAmount: detail.total_amount,
        printedAt: new Date(),
        itemCount: detail.order_items.length,
      };
      setPrintRecords(prev => [record, ...prev].slice(0, 30));

      // 自动打印
      if (localAuto) {
        printOrder(detail);
        toast.success(`🖨 已打印：${orderNumber}`);
      }
    } catch {
      setPendingCount(c => Math.max(0, c - 1));
      printedIds.current.delete(orderId);
      toast.error(`获取订单详情失败：${orderNumber}`);
    }
  }, [localAuto, printOrder]);

  // 手动重新打印某条记录
  const handleReprint = useCallback(async (record: PrintRecord) => {
    try {
      const detail = await fetchOrderWithItems(record.orderId);
      if (detail) {
        printOrder(detail);
        toast.success(`🖨 重新打印：${record.orderNumber}`);
      }
    } catch {
      toast.error('重新打印失败');
    }
  }, [printOrder]);

  // 测试打印：不依赖订单，验证「浏览器 → 默认打印机」这条通路是否通。
  // 打不出纸时先跑 print-station\fix-printer.cmd（端口绑错 / 队列脱机）。
  const handleTestPrint = useCallback(() => {
    const now = new Date().toISOString();
    const testOrder: OrderWithItems = {
      id: 'test-print',
      order_number: `TEST-${String(Date.now()).slice(-4)}`,
      status: 'making',
      payment_method: null,
      total_amount: 0,
      customer_lang: 'zh',
      created_at: now,
      updated_at: now,
      order_items: [{
        id: 'test-item',
        order_id: 'test-print',
        product_id: 'test-product',
        product_name: '打印通路测试',
        product_price: 0,
        quantity: 1,
        subtotal: 0,
        made: false,
      }],
    };
    printOrder(testOrder);
    toast.success('已发送测试打印，请看打印机是否出纸');
  }, [printOrder]);

  // Supabase Realtime 订阅
  useEffect(() => {
    setConnState('connecting');

    const channel = supabase
      .channel('print-station-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          const record = payload.new as { id?: string; order_number?: string; status?: string } | undefined;
          if (!record) return;
          // 捕获 INSERT 或 UPDATE 到 pending_payment 状态的订单
          if (record.status === 'pending_payment' && record.id && record.order_number) {
            handleNewPendingOrder(record.id, record.order_number);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnState('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnState('disconnected');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleNewPendingOrder]);

  const connColor = connState === 'connected' ? '#4ade80' : connState === 'connecting' ? '#fbbf24' : '#f87171';
  const connLabel = connState === 'connected' ? '已连接' : connState === 'connecting' ? '连接中…' : '已断线';

  return (
    <div className="p-5 md:p-7 flex flex-col gap-5 page-enter min-h-screen">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Printer className="w-5 h-5 text-primary" style={{ filter: 'drop-shadow(0 0 8px rgba(217,152,59,0.4))' }} />
          <h1 className="text-2xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>打印站</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="h-10 px-3 text-sm text-muted-foreground hover:text-foreground"
            style={{ border: '1px solid rgba(234,215,178,0.10)' }}
            onClick={handleTestPrint} title="验证浏览器到默认打印机这条通路">
            <Printer className="w-4 h-4 mr-1.5" />
            测试打印
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"
            onClick={reloadConfig} title="刷新配置">
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* 连接状态卡 */}
      <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
        <div className="relative shrink-0">
          {connState === 'connected'
            ? <Wifi className="w-7 h-7" style={{ color: connColor }} />
            : <WifiOff className="w-7 h-7" style={{ color: connColor }} />
          }
          {connState === 'connected' && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ background: connColor }} />
          )}
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className="text-base font-medium text-foreground">{connLabel}</span>
          <span className="text-xs text-muted-foreground">
            {connState === 'connected'
              ? '正在实时监听新订单，顾客付款后将自动推送'
              : connState === 'connecting'
              ? '正在建立 Supabase Realtime 连接…'
              : '连接中断，请刷新页面重新连接'}
          </span>
        </div>
        {pendingCount > 0 && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-sm animate-pulse"
            style={{ background: 'rgba(217,152,59,0.15)', border: '1px solid rgba(217,152,59,0.35)', color: 'hsl(var(--primary))' }}>
            <Clock className="w-4 h-4" />
            处理中 {pendingCount}
          </div>
        )}
      </div>

      {/* 控制面板 */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(234,215,178,0.07)' }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">自动打印</span>
            <span className="text-xs text-muted-foreground">新订单到达时立即弹出打印对话框</span>
          </div>
          <Switch
            checked={localAuto}
            onCheckedChange={async (v) => {
              setLocalAuto(v);
              const { updatePrintConfig } = await import('@/services/api');
              await updatePrintConfig({ print_auto: v }).catch(() => {});
            }}
          />
        </div>
        <div className="px-5 py-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span>纸张：</span>
          <span className="font-mono text-foreground">
            {printConfig.print_width_mm} × {printConfig.print_height_mm} mm
          </span>
          <span className="mx-2">·</span>
          <span>份数：</span>
          <span className="font-mono text-foreground">{printConfig.print_copies}</span>
          <span className="ml-auto text-xs">(在「支付配置」页修改)</span>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="rounded-2xl p-4 text-sm leading-relaxed"
        style={{ background: 'rgba(217,152,59,0.06)', border: '1px solid rgba(217,152,59,0.15)' }}>
        <p className="text-primary font-medium mb-2">🖨 打印站使用说明</p>
        <ol className="list-decimal pl-4 flex flex-col gap-1 text-muted-foreground">
          <li>将此页面保持在 <strong className="text-foreground">连接打印机的 PC 上常开</strong>（可缩小到后台标签页）</li>
          <li>顾客在任意设备下单并点击「我已完成付款」后，此页面将<strong className="text-foreground">实时收到订单</strong></li>
          <li>开启「自动打印」后系统自动弹出打印对话框；也可在下方记录中点击「重打」手动打印</li>
          <li>如连接断开请刷新页面重新连接</li>
        </ol>
      </div>

      {/* 待支付金额：顾客停在付款页时出现，10 秒收不到心跳自动收起 */}
      {pendingPayment && (
        <div className="glass-card rounded-2xl px-5 py-4 flex items-center gap-4 relative overflow-hidden"
          data-testid="pending-payment">
          <div className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(217,152,59,0.12)', border: '1px solid rgba(217,152,59,0.35)' }}>
            <Banknote className="w-6 h-6 text-primary" style={{ filter: 'drop-shadow(0 0 8px rgba(217,152,59,0.45))' }} />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="text-xs tracking-[0.22em] text-muted-foreground">待支付 · 顾客正在付款页</span>
            <span className="font-mono font-bold text-primary leading-none glow-number"
              style={{ fontSize: '1.9rem' }}>
              ¥{pendingPayment.amount.toFixed(2)}
            </span>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground flex items-center gap-2">
            {pendingPayment.itemCount > 0 && <span>{pendingPayment.itemCount} 件</span>}
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                style={{ background: 'hsl(var(--primary))' }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5"
                style={{ background: 'hsl(var(--primary))' }} />
            </span>
          </div>
          {/* 10 秒倒计时条：key 变化即重新计时 */}
          <div className="absolute left-0 right-0 bottom-0 h-0.5"
            style={{ background: 'rgba(234,215,178,0.06)' }}>
            <div key={pendingPayment.receivedAt} className="pending-countdown h-full"
              style={{ background: 'rgba(217,152,59,0.55)' }} />
          </div>
        </div>
      )}

      {/* 打印记录 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-foreground">本次打印记录</h2>
          <span className="text-xs text-muted-foreground">{printRecords.length} 张</span>
        </div>

        {printRecords.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground text-sm">
            <Printer className="w-8 h-8 mx-auto mb-3 opacity-30" />
            等待订单到来…
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {printRecords.map((rec, i) => (
              <div key={`${rec.orderId}-${i}`}
                className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-foreground truncate">{rec.orderNumber}</div>
                  <div className="text-xs text-muted-foreground">
                    {rec.itemCount} 件 · ¥{Number(rec.totalAmount).toFixed(2)} · {rec.printedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                  style={{ border: '1px solid rgba(234,215,178,0.10)' }}
                  onClick={() => handleReprint(rec)}>
                  <Printer className="w-3 h-3 mr-1" />
                  重打
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
