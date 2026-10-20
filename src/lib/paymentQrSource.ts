/** 由 scripts/sync-payment-qr.mjs 生成，请勿手改 */

/** 打包图对应的后台原地址；后台换成别的地址后付款页会以前台旧图顶着，等新图加载完再替换 */
export const BUNDLED_PAYMENT_QR_SOURCE: Record<string, string> = {
  wechat: "https://backend.appmiaoda.com/projects/supabase330193445119373312/storage/v1/object/public/payment-qrcodes/img_1783093958614_6r1t6hhxao3.jpg",
  alipay: "https://backend.appmiaoda.com/projects/supabase330193445119373312/storage/v1/object/public/payment-qrcodes/img_1783093976460_w6kyfhq2zal.jpg",
  paypay: "https://backend.appmiaoda.com/projects/supabase330193445119373312/storage/v1/object/public/payment-qrcodes/img_1783093986829_x3x40e8nhbg.jpg",
};

/** 同步时后台 payment_config.updated_at，用于排查打包图是否落后 */
export const BUNDLED_PAYMENT_QR_SYNCED_AT = "2026-07-05T12:58:02.192568+00:00";
