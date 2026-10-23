import { useEffect, useState } from 'react';
import { supabase } from '@/db/supabase';

/**
 * 「待支付」心跳通道。
 *
 * 顾客停在付款页时，页面每 2.5 秒广播一次当前金额；打印站订阅同一通道，
 * 收到就显示待支付金额，超过 10 秒没收到（顾客离开/关页面）就自己收起。
 * 用 Broadcast 而不是写库：不留数据、断线就自然消失，也免得给 orders 表加状态。
 */
const CHANNEL = 'pending-payment';
const EVENT = 'pending';
/**
 * 顾客侧心跳间隔（毫秒）。打印站是「最后一次心跳后 10 秒」收起，
 * 心跳取 1 秒能让「离开后多久消失」贴着 10 秒（误差不超过 1 秒）。
 */
const HEARTBEAT_MS = 1000;
/** 打印站多久没收到就当作顾客已离开（毫秒） */
const STALE_MS = 10000;

/** 打印站侧收到的待支付信息 */
export interface PendingPayment {
  /** 待支付金额（日元，购物车合计） */
  amount: number;
  /** 商品件数 */
  itemCount: number;
  /** 收到这条广播的本机时间戳，用来判断是否过期 */
  receivedAt: number;
}

/**
 * 顾客端：在付款页期间持续广播当前待支付金额。
 *
 * @param amount 购物车合计金额
 * @param itemCount 购物车件数
 */
export function usePendingPaymentBroadcast(amount: number, itemCount: number): void {
  useEffect(() => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    const channel = supabase.channel(CHANNEL, { config: { broadcast: { self: false } } });
    let timer: ReturnType<typeof setInterval> | null = null;

    const send = () => {
      void channel.send({
        type: 'broadcast',
        event: EVENT,
        payload: { amount, itemCount, ts: Date.now() },
      });
    };

    channel.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      send(); // 一进来就发一次，打印站不用等下一个心跳
      timer = setInterval(send, HEARTBEAT_MS);
    });

    return () => {
      if (timer) clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [amount, itemCount]);
}

/**
 * 打印站侧：订阅待支付心跳，超过 timeoutMs 没消息就返回 null（面板自动消失）。
 *
 * @param timeoutMs 静默多久算顾客已离开，默认 10 秒
 * @returns 最新一条待支付信息；过期或从未收到时为 null
 */
export function usePendingPayment(timeoutMs: number = STALE_MS): PendingPayment | null {
  const [pending, setPending] = useState<PendingPayment | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(CHANNEL)
      .on('broadcast', { event: EVENT }, ({ payload }) => {
        const amount = Number((payload as { amount?: unknown } | null)?.amount);
        const itemCount = Number((payload as { itemCount?: unknown } | null)?.itemCount);
        if (!Number.isFinite(amount) || amount <= 0) return;
        setPending({
          amount,
          itemCount: Number.isFinite(itemCount) && itemCount > 0 ? itemCount : 0,
          receivedAt: Date.now(),
        });
      })
      .subscribe();

    // 每秒检查一次过期：顾客关页面/离开付款页后不会有「离开」消息，靠静默超时收尾
    const tick = setInterval(() => {
      setPending(current => (current && Date.now() - current.receivedAt > timeoutMs ? null : current));
    }, 1000);

    return () => {
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [timeoutMs]);

  return pending;
}
