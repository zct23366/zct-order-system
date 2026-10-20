import wechatQr from '@/assets/payment-qr/wechat.png';
import alipayQr from '@/assets/payment-qr/alipay.png';
import paypayQr from '@/assets/payment-qr/paypay.png';
import { BUNDLED_PAYMENT_QR_SOURCE } from '@/lib/paymentQrSource';
import type { PaymentMethod } from '@/types/types';

/** 随前端一起发布的支付二维码 */
export interface BundledPaymentQr {
  /** Vite 打包后的同源地址（带内容哈希，可长期缓存） */
  src: string;
  /** 生成打包图时后台存的远程地址，用来判断后台是否已经换了新图 */
  sourceUrl: string;
}

/**
 * 付款页默认展示的二维码。
 *
 * 以前二维码只在 Supabase Storage 上：要等支付配置查询回来才拿得到地址，再从跨境 CDN 下 100–240KB，
 * 付款页因此要等一两秒才出码。这三张与线上同一张图，随前端发布后与页面同源、带哈希、可长缓存，
 * 首帧即可显示，也不再依赖配置查询。
 *
 * 打包图由 scripts/sync-payment-qr.mjs 在每次构建前从后台同步，换码会跟着下一次发布自动更新；
 * 没来得及发版时，PaymentPage 会先显示旧图、新图下载完再替换（见 loadRemotePaymentQr）。
 */
export const BUNDLED_PAYMENT_QR: Partial<Record<PaymentMethod, BundledPaymentQr>> = {
  wechat: { src: wechatQr, sourceUrl: BUNDLED_PAYMENT_QR_SOURCE.wechat ?? '' },
  alipay: { src: alipayQr, sourceUrl: BUNDLED_PAYMENT_QR_SOURCE.alipay ?? '' },
  paypay: { src: paypayQr, sourceUrl: BUNDLED_PAYMENT_QR_SOURCE.paypay ?? '' },
};

/** 后台换过的新二维码在 Cache Storage 里的缓存名 */
const QR_CACHE = 'payment-qr-v1';

async function openQrCache(): Promise<Cache | null> {
  try {
    if (!('caches' in window)) return null;
    return await caches.open(QR_CACHE);
  } catch {
    // 隐私模式等拿不到 Cache Storage，退化成每次都走网络
    return null;
  }
}

/**
 * 取后台配置里那张「打包图已经过期」的新二维码。
 *
 * 先查 Cache Storage：同一个地址第二次打开直接命中，返回一个 blob 地址，不再走网络；
 * 没命中就下载一次，顺手写进缓存供后续顾客使用。跨域、断网等失败时返回 null，调用方继续显示打包图。
 *
 * @param url 后台配置里的远程二维码地址
 * @returns 可直接放进 img.src 的地址，失败时为 null
 */
export async function loadRemotePaymentQr(url: string): Promise<string | null> {
  const cache = await openQrCache();
  if (cache) {
    const hit = await cache.match(url).catch(() => undefined);
    if (hit) return URL.createObjectURL(await hit.blob());
  }

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    void cache
      ?.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }))
      .catch(() => { /* 缓存写不进去不影响本次显示 */ });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * 空闲时把三张二维码预热进浏览器缓存。
 *
 * 用户从菜单页到付款页通常要看一会儿菜单，这段时间足够把三张图（合计约 50KB）从同源 CDN 取回，
 * 付款页就不用再发起任何图片请求。保存流量（saveData）或 2G 网络下跳过。
 */
export function preloadBundledPaymentQr(): void {
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return;

  const warm = () => {
    for (const qr of Object.values(BUNDLED_PAYMENT_QR)) {
      if (!qr) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = qr.src;
    }
  };

  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1200);
}
