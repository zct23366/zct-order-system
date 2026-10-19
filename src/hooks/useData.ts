import { useState, useEffect, useCallback } from 'react';
import {
  fetchCategories,
  fetchProducts,
  fetchOrders,
  fetchPaymentConfig,
  fetchActiveDisplayOrders,
  fetchStats,
  fetchPrintConfig,
} from '@/services/api';
import type { Category, Product, Order, OrderWithItems, PaymentConfig, PrintConfig, OrderStatus } from '@/types/types';

// ─── useMenu ─────────────────────────────────────────────
export function useMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [cats, prods] = await Promise.all([fetchCategories(), fetchProducts()]);
      setCategories(cats);
      setProducts(prods);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载菜单失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * 静默刷新：不切 loading、失败不报错，用于页面重新回到前台时同步最新菜单。
   * 路由切换本身会重新挂载并整页加载，这里补的是「菜单页一直开着」的场景
   * （点餐台平板长时间停在菜单上，后台改价/下架不会自动生效）。
   * @returns 刷新完成的 Promise
   */
  const refresh = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([fetchCategories(), fetchProducts()]);
      setCategories(cats);
      setProducts(prods);
      setError(null);
    } catch {
      // 静默：保留上一份数据，不打断顾客
    }
  }, []);

  return { categories, products, loading, error, reload: load, refresh };
}

// ─── useOrders (admin, with polling) ──────────────────────
export function useOrders(statusFilter?: OrderStatus[], pollInterval = 3000) {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchOrders(statusFilter);
      setOrders(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter?.join(',')]);  // eslint-disable-line

  useEffect(() => {
    load();
    const timer = setInterval(load, pollInterval);
    return () => clearInterval(timer);
  }, [load, pollInterval]);

  return { orders, loading, error, reload: load };
}

// ─── useDisplayOrders (出餐屏, 3s polling) ─────────────────
export function useDisplayOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchActiveDisplayOrders();
      setOrders(data);
    } catch {
      // 静默失败，继续轮询
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  return { orders, loading };
}

// ─── usePaymentConfig ─────────────────────────────────────
export function usePaymentConfig() {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPaymentConfig();
      setConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载支付配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { config, loading, error, reload: load };
}

// ─── useStats ─────────────────────────────────────────────
export function useStats(pollInterval = 5000) {
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [productStats, setProductStats] = useState<
    { product_name: string; quantity: number; revenue: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchStats();
      setTotalRevenue(data.totalRevenue);
      setProductStats(data.productStats);
    } catch {
      // 静默
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, pollInterval);
    return () => clearInterval(timer);
  }, [load, pollInterval]);

  return { totalRevenue, productStats, loading, reload: load };
}

// ─── usePrintConfig ───────────────────────────────────────
export function usePrintConfig() {
  const [config, setConfig] = useState<PrintConfig>({
    id: '',
    print_width_mm: 50,
    print_height_mm: 70,
    print_auto: false,
    print_copies: 1,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchPrintConfig();
      setConfig(data);
    } catch {
      // 使用默认值
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { config, loading, reload: load };
}
