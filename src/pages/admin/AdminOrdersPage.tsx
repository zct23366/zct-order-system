import { useState, useCallback } from 'react';
import { ChevronRight, RefreshCw, Trash2, X, Sparkles, UtensilsCrossed, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useOrders, usePrintConfig } from '@/hooks/useData';
import { usePrint } from '@/hooks/usePrint';
import { updateOrderStatus, fetchOrderWithItems, setOrderItemMade, setOrderItemOptionMade } from '@/services/api';
import type { OrderWithItems, OrderStatus } from '@/types/types';
import {
  PAYMENT_METHOD_LABELS,
  getNextStatus,
} from '@/types/types';
import { useLanguage } from '@/contexts/LanguageContext';

const STATUS_CLASS: Record<string, string> = {
  created: 'status-created',
  pending_payment: 'status-pending',
  making: 'status-making',
  ready: 'status-ready',
  completed: 'status-completed',
  cancelled: 'status-cancelled',
};

/** 一张「已完成」样式的小卡（点击切换制作状态） */
function MadeChip({
  label, qty, made, onToggle, sub,
}: {
  label: string;
  qty: number;
  made: boolean;
  onToggle: () => void;
  sub?: string;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg text-sm transition-all select-none text-left"
      style={{
        background: made ? 'rgba(120,110,100,0.12)' : 'rgba(234,215,178,0.07)',
        border: `1px solid ${made ? 'rgba(120,110,100,0.18)' : 'rgba(234,215,178,0.14)'}`,
        opacity: made ? 0.45 : 1,
        textDecoration: made ? 'line-through' : 'none',
        color: made ? 'hsl(var(--muted-foreground))' : 'hsl(var(--foreground))',
      }}
    >
      <div className="flex items-center gap-1.5">
        <UtensilsCrossed className="w-3 h-3 shrink-0" style={{ opacity: made ? 0.5 : 0.7 }} />
        <span className="truncate max-w-[10rem]">{label}</span>
        {qty > 1 && <span className="text-xs text-muted-foreground shrink-0">×{qty}</span>}
      </div>
      {sub && (
        <div className="flex items-center gap-1 pl-4 text-xs text-muted-foreground leading-tight">
          <span className="text-primary/40 shrink-0">+</span>
          <span className="truncate max-w-[9rem]">{sub}</span>
        </div>
      )}
    </button>
  );
}

/**
 * 订单里的菜品卡片。
 * 套餐（选项行 option_id 为 null）不再把单品塞在副行里，而是让每个单品独立成卡，
 * 各自勾选「制作完成」并落库；普通菜品仍是一张卡（加料作为副行显示）。
 */
function ProductChips({ order, onToggleItem, onToggleOption }: {
  order: OrderWithItems;
  onToggleItem: (itemId: string, made: boolean) => void;
  onToggleOption: (rowId: string, made: boolean) => void;
}) {
  if (!order.order_items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {order.order_items.flatMap(item => {
        const rows = (item.order_item_options ?? []).filter(o => o.quantity > 0);
        const parts = rows.filter(o => o.option_id === null);
        const modifiers = rows.filter(o => o.option_id !== null);

        if (parts.length > 0) {
          // 套餐：主卡只做标识（不可勾），每个单品一张独立的完成卡
          return [
            <div key={item.id}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm"
              style={{ background: 'rgba(217,152,59,0.08)', border: '1px solid rgba(217,152,59,0.20)' }}>
              <Sparkles className="w-3 h-3 shrink-0 text-primary/70" />
              <span className="truncate max-w-[9rem] text-primary/90">{item.product_name}</span>
              {item.quantity > 1 && <span className="text-xs text-primary/60 shrink-0">×{item.quantity}</span>}
            </div>,
            ...parts.map(part => (
              <MadeChip
                key={part.id}
                label={part.option_name}
                qty={item.quantity}
                made={!!part.made}
                onToggle={() => onToggleOption(part.id, !part.made)}
              />
            )),
          ];
        }

        return [
          <MadeChip
            key={item.id}
            label={item.product_name}
            qty={item.quantity}
            made={!!item.made}
            sub={modifiers[0]?.option_name}
            onToggle={() => onToggleItem(item.id, !item.made)}
          />,
        ];
      })}
    </div>
  );
}

export default function AdminOrdersPage() {
  const { t } = useLanguage();
  const to = t.adminOrders;

  const STATUS_TABS: { value: OrderStatus | 'all'; label: string }[] = [
    { value: 'all', label: to.tabs.all },
    { value: 'pending_payment', label: to.tabs.pending_payment },
    { value: 'making', label: to.tabs.making },
    { value: 'ready', label: to.tabs.ready },
    { value: 'completed', label: to.tabs.completed },
    { value: 'cancelled', label: to.tabs.cancelled },
  ];

  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all');
  const [confirmOrder, setConfirmOrder] = useState<{ order: OrderWithItems; nextStatus: OrderStatus } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OrderWithItems | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderWithItems | null>(null);
  const [detailOrder, setDetailOrder] = useState<OrderWithItems | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const statusFilter = activeTab === 'all' ? undefined : [activeTab];
  const { orders, loading, reload } = useOrders(statusFilter, 3000);

  // ── 手动打印（打印站负责自动打印，此处仅保留手动按钮）────────
  const { config: printConfig } = usePrintConfig();
  const { printOrder } = usePrint(printConfig);

  const handlePrint = useCallback(async (order: OrderWithItems) => {
    try {
      const detail = await fetchOrderWithItems(order.id);
      if (detail) printOrder(detail);
    } catch {
      toast.error('打印失败，请重试');
    }
  }, [printOrder]);

  // 制作完成状态直接落库（刷新、另一台设备都能同步）
  const handleToggleItemMade = useCallback(async (itemId: string, made: boolean) => {
    try {
      await setOrderItemMade(itemId, made);
      await reload();
    } catch {
      toast.error('更新制作状态失败');
    }
  }, [reload]);

  const handleToggleOptionMade = useCallback(async (rowId: string, made: boolean) => {
    try {
      await setOrderItemOptionMade(rowId, made);
      await reload();
    } catch {
      toast.error('更新制作状态失败');
    }
  }, [reload]);

  const handleAdvance = (order: OrderWithItems) => {
    const next = getNextStatus(order.status);
    if (!next) return;
    if (next === 'completed') {
      setConfirmOrder({ order, nextStatus: next });
    } else {
      doAdvance(order.id, next);
    }
  };

  const doAdvance = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, nextStatus);
      toast.success(`→ ${to.statusLabels[nextStatus]}`);
      reload();
    } catch {
      toast.error(to.advanceFailed);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await updateOrderStatus(cancelTarget.id, 'cancelled');
      toast.success(to.cancelSuccess);
      reload();
    } catch {
      toast.error(to.advanceFailed);
    } finally {
      setCancelTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await updateOrderStatus(deleteTarget.id, 'deleted');
      toast.success(to.cancelSuccess);
      reload();
    } catch {
      toast.error(to.advanceFailed);
    } finally {
      setDeleteTarget(null);
    }
  };

  const openDetail = async (order: OrderWithItems) => {
    try {
      const detail = await fetchOrderWithItems(order.id);
      if (detail) {
        setDetailOrder(detail);
        setDetailOpen(true);
      }
    } catch {
      toast.error(to.advanceFailed);
    }
  };

  const canAdvance = (s: OrderStatus) => ['pending_payment', 'making', 'ready'].includes(s);
  const canCancel  = (s: OrderStatus) => ['pending_payment', 'making', 'ready'].includes(s);
  const canDelete  = (s: OrderStatus) => ['created', 'completed', 'cancelled'].includes(s);

  return (
    <div className="p-5 md:p-7 flex flex-col gap-5 page-enter">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary" style={{ filter: 'drop-shadow(0 0 8px rgba(217,152,59,0.35))' }} />
          <h1 className="text-2xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>{to.title}</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={reload} className="h-10 w-10 text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-5 h-5" />
        </Button>
      </div>

      {/* 状态筛选标签 */}
      <div className="overflow-x-auto whitespace-nowrap">
        <div className="inline-flex gap-2">
          {STATUS_TABS.map(tab => (
            <button key={tab.value} onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all min-h-[40px] ${
                activeTab === tab.value ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={activeTab === tab.value ? {
                background: 'rgba(217,148,58,0.13)', border: '1px solid rgba(217,148,58,0.35)'
              } : {
                background: 'rgba(234,215,178,0.04)', border: '1px solid rgba(234,215,178,0.09)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground animate-pulse text-base">{to.loading}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-base">{to.empty}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map(order => (
            <div key={order.id} className="glass-card relative rounded-2xl p-5 flex flex-col gap-3 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <button className="flex items-center gap-1.5 text-base font-medium hover:text-primary transition-colors min-w-0 text-foreground group"
                  onClick={() => openDetail(order)}>
                  <span className="font-mono truncate">{order.order_number}</span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </button>
                <span className={`text-sm px-3 py-1 rounded-full shrink-0 ${STATUS_CLASS[order.status] ?? 'status-created'}`}>
                  {to.statusLabels[order.status as keyof typeof to.statusLabels] ?? order.status}
                </span>
              </div>

              <ProductChips
                order={order}
                onToggleItem={handleToggleItemMade}
                onToggleOption={handleToggleOptionMade}
              />

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="text-primary font-medium text-base glow-number">¥{Number(order.total_amount).toFixed(2)}</span>
                {order.payment_method && <span>{PAYMENT_METHOD_LABELS[order.payment_method]}</span>}
                <span className="ml-auto">
                  {new Date(order.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="tech-divider" />

              <div className="flex items-center gap-2.5 flex-wrap">
                {canAdvance(order.status) && (
                  <Button size="sm" className="h-9 px-4 text-sm bg-primary text-primary-foreground hover:bg-secondary"
                    onClick={() => handleAdvance(order)}>
                    {to.actionLabels[order.status as keyof typeof to.actionLabels] ?? to.advanceOk}
                  </Button>
                )}
                {/* 打印按钮 */}
                <Button size="sm" variant="ghost" className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground"
                  style={{ border: '1px solid rgba(234,215,178,0.10)' }}
                  onClick={() => handlePrint(order)}
                  title="打印小票">
                  <Printer className="w-4 h-4" />
                </Button>
                {canCancel(order.status) && (
                  <Button size="sm" variant="ghost" className="h-9 px-4 text-sm text-muted-foreground hover:text-foreground"
                    style={{ border: '1px solid rgba(234,215,178,0.10)' }} onClick={() => setCancelTarget(order)}>
                    <X className="w-4 h-4 mr-1.5" />{to.cancel}
                  </Button>
                )}
                {canDelete(order.status) && (
                  <Button size="sm" variant="ghost" className="h-9 px-4 text-sm text-destructive hover:text-destructive"
                    style={{ border: '1px solid rgba(234,215,178,0.10)' }} onClick={() => setDeleteTarget(order)}>
                    <Trash2 className="w-4 h-4 mr-1.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 完成订单确认 */}
      <AlertDialog open={!!confirmOrder} onOpenChange={open => !open && setConfirmOrder(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{to.actionLabels.ready}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono font-medium">{confirmOrder?.order.order_number}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{to.cancelCancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-primary text-primary-foreground hover:bg-secondary"
              onClick={() => { if (confirmOrder) doAdvance(confirmOrder.order.id, confirmOrder.nextStatus); setConfirmOrder(null); }}>
              {to.advanceOk}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 取消订单确认 */}
      <AlertDialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{to.cancel}</AlertDialogTitle>
            <AlertDialogDescription>{to.cancelConfirm} <span className="font-mono font-medium">{cancelTarget?.order_number}</span></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{to.cancelCancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleCancel}>{to.cancelOk}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除订单确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{to.cancelOk}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{to.cancelCancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={handleDelete}>{to.cancelOk}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 订单详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{detailOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {detailOrder && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-base">
                <span className="text-muted-foreground">{to.tabs.all}</span>
                <span className={`text-sm px-3 py-1 rounded-full ${STATUS_CLASS[detailOrder.status]}`}>
                  {to.statusLabels[detailOrder.status as keyof typeof to.statusLabels]}
                </span>
              </div>
              {detailOrder.payment_method && (
                <div className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">{PAYMENT_METHOD_LABELS[detailOrder.payment_method]}</span>
                  <span>{PAYMENT_METHOD_LABELS[detailOrder.payment_method]}</span>
                </div>
              )}
              <div className="pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(234,215,178,0.07)' }}>
                {detailOrder.order_items.map(item => {
                  const opts = (item.order_item_options ?? []).filter(o => o.quantity > 0);
                  return (
                    <div key={item.id} className="flex flex-col gap-1">
                      {/* 商品主行 */}
                      <div className="flex items-center justify-between text-base">
                        <span className="text-foreground flex-1 min-w-0 truncate">{item.product_name}</span>
                        <span className="text-muted-foreground mx-4">×{item.quantity}</span>
                        <span className="text-primary shrink-0">¥{Number(item.subtotal).toFixed(2)}</span>
                      </div>
                      {/* 已选选项明细 */}
                      {opts.length > 0 && (
                        <div className="flex flex-col gap-0.5 pl-3">
                          {opts.map(opt => (
                            <div key={opt.id} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground flex items-center gap-1.5 min-w-0 flex-1 truncate">
                                <span className="text-primary/40">└</span>
                                {opt.option_name} ×{opt.quantity}
                              </span>
                              {opt.unit_price > 0 && (
                                <span className="text-primary/70 shrink-0 ml-3">
                                  +¥{Number(opt.subtotal).toFixed(2)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="pt-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(234,215,178,0.07)' }}>
                <span className="text-base font-medium text-foreground">{to.total}</span>
                <span className="text-xl font-medium text-primary glow-number">¥{Number(detailOrder.total_amount).toFixed(2)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
