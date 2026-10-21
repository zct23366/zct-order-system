#!/usr/bin/env node
/**
 * 生成 iPadOS 独立运行（PWA）所需的位图资产。
 *
 * 产物全部落在 public/ 下，随 Vite 构建原样拷进 dist：
 *   public/icons/icon-192.png            manifest 图标（any）
 *   public/icons/icon-512.png            manifest 图标（any）
 *   public/icons/icon-maskable-512.png   Android 自适应图标（logo 收进安全区）
 *   public/icons/apple-touch-icon.png    iOS / iPadOS 主屏图标（180×180）
 *   public/splash/ipad-<宽>x<高>.png      各代 iPad 的启动图（竖屏 + 横屏，2 倍像素）
 *
 * 源图是 public/favicon.jpg，只换尺寸与留白，不改视觉。
 * 用法：node scripts/generate-pwa-assets.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = path.join(ROOT, 'public', 'favicon.jpg');
const ICON_DIR = path.join(ROOT, 'public', 'icons');
const SPLASH_DIR = path.join(ROOT, 'public', 'splash');

/** 页面背景色（index.css 的 --background: hsl(20 30% 5%)），启动图与图标底色都用它。 */
const BACKGROUND = '#0D0905';

/**
 * 各代 iPad 的 CSS 像素尺寸（竖屏）。启动图按 2 倍像素输出，
 * 横屏直接把宽高对调——iPadOS 按 (device-width/height + dpr + orientation) 精确匹配。
 */
const IPAD_SIZES = [
  { cssWidth: 1024, cssHeight: 1366 }, // iPad Pro 13" M4 / Pro 12.9"
  { cssWidth: 834, cssHeight: 1210 }, // iPad Pro 11" M4
  { cssWidth: 834, cssHeight: 1194 }, // iPad Pro 11" / Air 4·5
  { cssWidth: 820, cssHeight: 1180 }, // iPad 10.9"
  { cssWidth: 810, cssHeight: 1080 }, // iPad 10.2"
  { cssWidth: 768, cssHeight: 1024 }, // iPad 9.7" / mini 5
  { cssWidth: 744, cssHeight: 1133 }, // iPad mini 6
];

/** 取源图左上角一块的填充色，让启动图底色与图标金色一致。 */
async function sampleBrandColor() {
  const { data } = await sharp(SRC)
    .extract({ left: 8, top: 8, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return `#${[data[0], data[1], data[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 把正方形图标裁圆角，供启动图合成时使用。 */
async function roundedIcon(size, radius) {
  const square = await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(square).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

/** logo 外圈的细金环，与页面里卡片描边的色值同源。 */
function ringSvg(size, radius, brandColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 8}" height="${size + 8}">
  <rect x="2" y="2" width="${size + 4}" height="${size + 4}" rx="${radius + 2}" ry="${radius + 2}"
    fill="none" stroke="${brandColor}" stroke-opacity="0.34" stroke-width="2"/>
</svg>`;
}

async function writeIcons(brandColor) {
  await fs.mkdir(ICON_DIR, { recursive: true });

  for (const size of [192, 512]) {
    const file = path.join(ICON_DIR, `icon-${size}.png`);
    await sharp(SRC).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(file);
    console.log(`✓ ${path.relative(ROOT, file)}`);
  }

  // 自适应图标：整块金色底 + 缩小到 72% 的 logo，保证落在外圈 20% 安全区内不被裁切。
  const maskable = 512;
  const inner = Math.round(maskable * 0.72);
  const innerIcon = await sharp(SRC).resize(inner, inner, { fit: 'cover' }).toBuffer();
  const maskableFile = path.join(ICON_DIR, 'icon-maskable-512.png');
  await sharp({ create: { width: maskable, height: maskable, channels: 4, background: brandColor } })
    .composite([{ input: innerIcon, left: Math.round((maskable - inner) / 2), top: Math.round((maskable - inner) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(maskableFile);
  console.log(`✓ ${path.relative(ROOT, maskableFile)}`);

  // iOS 主屏图标：180×180、不透明白底会被系统自行加圆角，这里出满幅方图。
  const touchFile = path.join(ICON_DIR, 'apple-touch-icon.png');
  await sharp(SRC).resize(180, 180, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(touchFile);
  console.log(`✓ ${path.relative(ROOT, touchFile)}`);
}

async function writeSplash(brandColor) {
  await fs.mkdir(SPLASH_DIR, { recursive: true });

  for (const { cssWidth, cssHeight } of IPAD_SIZES) {
    for (const [w, h] of [
      [cssWidth * 2, cssHeight * 2], // 竖屏
      [cssHeight * 2, cssWidth * 2], // 横屏
    ]) {
      const logo = Math.round(Math.min(w, h) * 0.26);
      const radius = Math.round(logo * 0.22);
      const icon = await roundedIcon(logo, radius);
      const ring = Buffer.from(ringSvg(logo, radius, brandColor));

      const file = path.join(SPLASH_DIR, `ipad-${w}x${h}.png`);
      const left = Math.round((w - logo) / 2);
      const top = Math.round((h - logo) / 2);
      // 纯色底 + 调色板量化：启动图只在冷启动闪一下，压到十几 KB 比追求无损更重要
      // （渐变底在低色深下会起带，所以这里干脆不留渐变）。
      const png = await sharp({ create: { width: w, height: h, channels: 4, background: BACKGROUND } })
        .composite([
          { input: ring, left: left - 4, top: top - 4 },
          { input: icon, left, top },
        ])
        .png({ palette: true, colors: 64, dither: 0, effort: 8 })
        .toFile(file);
      console.log(`✓ ${path.relative(ROOT, file)}  ${(png.size / 1024).toFixed(1)} KB`);
    }
  }
}

const brandColor = await sampleBrandColor();
console.log(`brand color: ${brandColor}`);
await writeIcons(brandColor);
await writeSplash(brandColor);
console.log('PWA 资产生成完毕。');
