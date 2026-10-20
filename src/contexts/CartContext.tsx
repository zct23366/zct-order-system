import React, { createContext, useContext, useState, useCallback } from 'react';
import type { CartItem, CartItemOption, Product } from '@/types/types';

/**
 * 购物车行标识：同一商品 + 完全相同的选项才算同一行。
 * 同一道菜配不同的加料/套餐搭配必须是两行，改数量、删除都按这个 key 定位。
 * @param item 至少含商品与已选选项的购物车项
 * @returns 行标识字符串
 */
export function cartLineKey(item: Pick<CartItem, 'product' | 'selectedOptions'>): string {
  return `${item.product.id}|${JSON.stringify(item.selectedOptions)}`;
}

interface CartContextValue {
  items: CartItem[];
  /** 以 product+selectedOptions 组合加入购物车（每次调用追加1份） */
  addItem: (product: Product, selectedOptions?: CartItemOption[]) => void;
  /** 按行标识删除一整行 */
  removeItem: (lineKey: string) => void;
  /** 按行标识改数量，数量 ≤0 时删除该行 */
  updateQuantity: (lineKey: string, quantity: number) => void;
  clearCart: () => void;
  totalAmount: number;
  totalCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

/** 计算单个购物车项的单价（商品基础价 + 选项总价） */
function itemUnitPrice(item: CartItem): number {
  const optExtra = item.selectedOptions.reduce(
    (s, o) => s + o.unit_price * o.quantity, 0
  );
  return item.product.price + optExtra;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: Product, selectedOptions: CartItemOption[] = []) => {
    setItems(prev => {
      // 同一商品 + 完全相同的选项配置才合并数量
      const key = cartLineKey({ product, selectedOptions });
      const existingIdx = prev.findIndex(i => cartLineKey(i) === key);
      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1, selectedOptions }];
    });
  }, []);

  const removeItem = useCallback((lineKey: string) => {
    setItems(prev => prev.filter(i => cartLineKey(i) !== lineKey));
  }, []);

  const updateQuantity = useCallback((lineKey: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => cartLineKey(i) !== lineKey));
    } else {
      setItems(prev =>
        prev.map(i => cartLineKey(i) === lineKey ? { ...i, quantity } : i)
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalAmount = items.reduce(
    (sum, i) => sum + itemUnitPrice(i) * i.quantity, 0
  );

  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalAmount, totalCount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
