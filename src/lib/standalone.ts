/**
 * iPadOS「无边框独立运行」的运行时判定。
 *
 * index.html 的内联脚本已经先给 <html> 打了 is-ios / is-standalone 标记（早于首帧），
 * 这里给出同一套判定的模块版本：组件用它决定要不要提示「添加到主屏幕」，
 * 并提供一个显示模式变化订阅（浏览器标签页 ↔ 独立窗口）。
 */

/** 当前页面的显示模式：浏览器标签页，或各种独立窗口形态。 */
export type DisplayMode = 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui';

const DISPLAY_MODE_QUERIES: ReadonlyArray<[Exclude<DisplayMode, 'browser'>, string]> = [
  ['standalone', '(display-mode: standalone)'],
  ['fullscreen', '(display-mode: fullscreen)'],
  ['minimal-ui', '(display-mode: minimal-ui)'],
];

/**
 * 是否运行在 iOS / iPadOS 上。
 *
 * iPadOS 13 起 Safari 的 UA 与桌面 macOS 一致（Macintosh），
 * 只能用「Macintosh + 多点触控」把真 iPad 和 Mac 区分开：Mac 的 maxTouchPoints 是 0。
 *
 * @returns iOS / iPadOS 设备为 true
 */
export function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * 是否手机 / 平板这类移动设备。
 * Chrome 系走 UA-CH 的 mobile 标记，Safari 等没这个接口就退回 UA 关键词。
 * 用来把「安装到桌面」原生按钮限制在平板上：收银台那台 Windows kiosk 是触摸屏，
 * 光看触点数量会被误判成平板。
 *
 * @returns 移动设备为 true
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === 'boolean') return uaData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * 当前显示模式。iOS 的独立窗口没有 display-mode 媒体查询也会应答（老版本），
 * 所以 navigator.standalone 优先。
 *
 * @returns 浏览器态返回 'browser'，独立态返回对应形态
 */
export function currentDisplayMode(): DisplayMode {
  if (typeof window === 'undefined') return 'browser';
  // iOS Safari 独有：添加到主屏幕后为 true，且不保证 matchMedia 可用
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return 'standalone';
  for (const [mode, query] of DISPLAY_MODE_QUERIES) {
    if (window.matchMedia?.(query).matches) return mode;
  }
  return 'browser';
}

/**
 * 是否以独立窗口运行（即「无边框」形态：没有地址栏与工具栏）。
 *
 * @returns 独立窗口为 true
 */
export function isStandaloneDisplay(): boolean {
  return currentDisplayMode() !== 'browser';
}

/**
 * 订阅显示模式变化。Safari 里从标签页进入已安装的独窗会触发匹配的媒体查询变化。
 *
 * @param listener 显示模式变化时回调
 * @returns 取消订阅函数
 */
export function onDisplayModeChange(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const queries = DISPLAY_MODE_QUERIES.map(([, query]) => window.matchMedia(query));
  for (const query of queries) query.addEventListener('change', listener);
  return () => {
    for (const query of queries) query.removeEventListener('change', listener);
  };
}
