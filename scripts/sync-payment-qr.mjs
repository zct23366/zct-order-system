#!/usr/bin/env node
/**
 * 把后台「支付配置」里当前的二维码同步成前端打包资源。
 *
 * 前端付款页优先显示随包发布的二维码（同源、带哈希、可长缓存），这样点「提交支付」时不用等
 * 跨境 CDN 上的 100–240KB 原图。后台换码后打包图会过期，所以构建前先跑本脚本拉一遍最新的：
 * 图压到 640px 调色板 PNG（单张 10–40KB，扫码内容与原图逐字节一致），并把远程原地址写进
 * src/lib/paymentQrSource.ts，供运行时判断「后台是不是已经换了新图」。
 *
 * 设计前提：构建期间的任何失败都不能挡住发布 —— 网络不通、后台没配、接口报错都只留旧图并打印告警。
 * 手动执行：npm run sync:qr
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = join(root, 'src/assets/payment-qr');
const sourceFile = join(root, 'src/lib/paymentQrSource.ts');
const METHODS = ['wechat', 'alipay', 'paypay'];

const log = (...args) => console.log('[sync-payment-qr]', ...args);

/** 从 src/db/supabase.ts 读连接信息，避免密钥在两个地方各存一份 */
async function readSupabaseConfig() {
  const text = await readFile(join(root, 'src/db/supabase.ts'), 'utf8');
  const url = text.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = text.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)?.[1];
  if (!url || !key) throw new Error('src/db/supabase.ts 里找不到 SUPABASE_URL / SUPABASE_ANON_KEY');
  return { url, key };
}

async function fetchPaymentConfig({ url, key }) {
  const res = await fetch(`${url}/rest/v1/payment_config?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`payment_config 返回 ${res.status}`);
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error('payment_config 没有配置行');
  return row;
}

/** 读上一次记录的原图指纹：源图没变就不再重新编码（不同平台的 libvips 编出来的字节可能不同） */
async function readSyncedHashes() {
  if (!existsSync(sourceFile)) return {};
  const text = await readFile(sourceFile, 'utf8');
  const block = text.match(/BUNDLED_PAYMENT_QR_SOURCE_HASH[^{]*\{([\s\S]*?)\}/)?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/(\w+):\s*"([0-9a-f]{40})"/g)].map(([, method, hash]) => [method, hash])
  );
}

/** 下载并压成 640px 调色板 PNG；源图内容没变就沿用仓库里的图 */
async function syncQr(method, remoteUrl, prevSourceHash) {
  const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`二维码下载失败 ${res.status}`);
  const source = Buffer.from(await res.arrayBuffer());
  const sourceHash = createHash('sha1').update(source).digest('hex');
  const target = join(assetDir, `${method}.png`);

  if (prevSourceHash === sourceHash && existsSync(target)) {
    log(`${method}: ${remoteUrl.split('/').pop()} → 源图未变，沿用打包图`);
    return { url: remoteUrl, sourceHash };
  }

  const png = await sharp(source)
    .resize({ width: 640, kernel: 'lanczos3', withoutEnlargement: true })
    .png({ palette: true, colours: 64, quality: 100, effort: 10 })
    .toBuffer();
  await writeFile(target, png);
  log(`${method}: ${remoteUrl.split('/').pop()} → ${(png.length / 1024).toFixed(1)}KB（已更新）`);
  return { url: remoteUrl, sourceHash };
}

function renderSourceFile(sources, hashes, syncedAt) {
  const sourceEntries = Object.entries(sources)
    .map(([method, url]) => `  ${method}: ${JSON.stringify(url)},`)
    .join('\n');
  const hashEntries = Object.entries(hashes)
    .map(([method, hash]) => `  ${method}: ${JSON.stringify(hash)},`)
    .join('\n');
  return `/** 由 scripts/sync-payment-qr.mjs 生成，请勿手改 */

/** 打包图对应的后台原地址；后台换成别的地址后付款页会以前台旧图顶着，等新图加载完再替换 */
export const BUNDLED_PAYMENT_QR_SOURCE: Record<string, string> = {
${sourceEntries}
};

/** 生成打包图时下载到的原图 sha1：源图没变时构建直接沿用仓库里的图，不重复编码 */
export const BUNDLED_PAYMENT_QR_SOURCE_HASH: Record<string, string> = {
${hashEntries}
};

/** 同步时后台 payment_config.updated_at，用于排查打包图是否落后 */
export const BUNDLED_PAYMENT_QR_SYNCED_AT = ${JSON.stringify(syncedAt)};
`;
}

try {
  const config = await fetchPaymentConfig(await readSupabaseConfig());
  await mkdir(assetDir, { recursive: true });
  const prevHashes = await readSyncedHashes();

  const sources = {};
  const hashes = {};
  for (const method of METHODS) {
    const remoteUrl = config?.[`${method}_qrcode_url`];
    if (!remoteUrl) {
      log(`${method}: 后台未配置，沿用仓库里的旧图`);
      continue;
    }
    const synced = await syncQr(method, remoteUrl, prevHashes[method]);
    sources[method] = synced.url;
    hashes[method] = synced.sourceHash;
  }

  const next = renderSourceFile(sources, hashes, String(config.updated_at ?? ''));
  const prev = existsSync(sourceFile) ? await readFile(sourceFile, 'utf8') : '';
  if (next !== prev) {
    await writeFile(sourceFile, next);
    log('已更新 src/lib/paymentQrSource.ts');
  }
  log('完成');
} catch (error) {
  // 构建期间网络/后台不可用时保留仓库里的旧图，不阻断发布
  log(`跳过同步：${error instanceof Error ? error.message : error}（沿用现有打包图）`);
}
