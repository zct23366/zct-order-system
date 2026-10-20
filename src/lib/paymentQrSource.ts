/** 由 scripts/sync-payment-qr.mjs 生成，请勿手改 */

/** 打包图对应的后台原地址；后台换成别的地址后付款页会以前台旧图顶着，等新图加载完再替换 */
export const BUNDLED_PAYMENT_QR_SOURCE: Record<string, string> = {
  wechat: "https://occsfgsqshrhhjkzgplz.supabase.co/storage/v1/object/public/payment-qrcodes/qr_wechat_1792531067504.jpg",
  alipay: "https://occsfgsqshrhhjkzgplz.supabase.co/storage/v1/object/public/payment-qrcodes/qr_alipay_1792531067504.jpg",
  paypay: "https://occsfgsqshrhhjkzgplz.supabase.co/storage/v1/object/public/payment-qrcodes/qr_paypay_1792531067504.jpg",
};

/** 生成打包图时下载到的原图 sha1：源图没变时构建直接沿用仓库里的图，不重复编码 */
export const BUNDLED_PAYMENT_QR_SOURCE_HASH: Record<string, string> = {
  wechat: "199597d2ca36215cc7c25456bbde1b579fd2e753",
  alipay: "5325751424e822fbfa0afcd7f0e1309d13f03747",
  paypay: "08d54dd6d563b8e9adf9876ba8c1ef81fce2a89d",
};

/** 同步时后台 payment_config.updated_at，用于排查打包图是否落后 */
export const BUNDLED_PAYMENT_QR_SYNCED_AT = "2026-10-20T21:17:53.456984+00:00";
