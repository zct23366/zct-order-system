#!/usr/bin/env node
/**
 * 校验「iPadOS 无边框独立运行」这套能力真的落地了。
 *
 * 做法：把 dist/ 起一个本地静态服务，用无头 Edge 通过 CDP 打开页面，逐项断言：
 *   1. index.html 里的 manifest / Apple meta / 启动图链接齐全；
 *   2. manifest 的 display=standalone 等关键字段，图标与启动图真的能取到、尺寸与名字对得上；
 *   3. 桌面浏览器里不显示「添加到主屏幕」胶囊；
 *   4. iPadOS（Macintosh UA + 多点触控）浏览器态下胶囊出现；
 *   5. 独窗态（navigator.standalone / display-mode）下 <html> 打上 is-standalone，
 *      安全区变量生效，胶囊自己消失，页面没有横向溢出。
 *
 * 用法：node scripts/check-pwa.mjs [--keep-screenshot]
 * 前置：先 npm run build；本机需装 Edge（或设 EDGE_PATH 指向 msedge.exe）。
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const KEEP_SHOT = process.argv.includes('--keep-screenshot');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** iPadOS 的 UA 与桌面 Safari 同形，区别只在多点触控——这也是 isIosLike 的判据。 */
const IPADOS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

const failures = [];

/**
 * 记录一条断言结果。
 *
 * @param ok 断言是否成立
 * @param label 断言描述
 * @param detail 失败时补充的实测值
 */
function check(ok, label, detail) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    return;
  }
  const line = detail === undefined ? label : `${label} —— 实测：${JSON.stringify(detail)}`;
  failures.push(line);
  console.log(`  ✗ ${line}`);
}

function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) {
    throw new Error(`找不到 Edge，请用 EDGE_PATH 指定 msedge.exe（试过：${candidates.join(', ')}）`);
  }
  return found;
}

async function freePort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

function startStaticServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let filePath = path.join(DIST, urlPath);
      if (!filePath.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // SPA 回退，和 vercel.json 的 rewrite 一致
        filePath = path.join(DIST, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** 极简 CDP 客户端：一条 WebSocket 连接，按 id 分发响应。 */
class Cdp {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.#pending.has(msg.id)) {
        const { resolve, reject } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
        return;
      }
      const waiters = this.#listeners.get(msg.method);
      if (waiters?.length) waiters.shift()(msg.params);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error(`CDP 连接失败：${url}`)), { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  once(method) {
    return new Promise(resolve => {
      const waiters = this.#listeners.get(method) ?? [];
      waiters.push(resolve);
      this.#listeners.set(method, waiters);
    });
  }

  close() {
    this.#ws.close();
  }
}

/** 在页面里求值，返回结构化结果；页面抛错时原样上抛。 */
async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(`页面求值异常：${detail}`);
  }
  return result.result.value;
}

/**
 * 打开页面并等它渲染好。
 *
 * @param cdp CDP 客户端
 * @param sessionId 目标页会话
 * @param url 要打开的地址
 * @param selector 可选：必须出现的选择器（懒加载页面要等懒加载完成，不能只看 #root 有内容）
 */
async function navigate(cdp, sessionId, url, selector = '#root > *') {
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url }, sessionId);
  await loaded;
  for (let i = 0; i < 80; i++) {
    const ready = await evaluate(cdp, sessionId, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`页面 ${url} 没有等到 ${selector}`);
}

/** 页面侧断言：清单、meta、图标、启动图。 */
const CONTENT_CHECKS = `(async () => {
  const out = { problems: [], info: {} };
  const fail = (msg) => out.problems.push(msg);

  const link = document.querySelector('link[rel="manifest"]');
  if (!link) fail('index.html 缺少 <link rel="manifest">');
  const manifestUrl = link ? link.href : '';
  out.info.manifestUrl = manifestUrl;

  let manifest = null;
  if (manifestUrl) {
    const res = await fetch(manifestUrl);
    out.info.manifestStatus = res.status;
    out.info.manifestType = res.headers.get('content-type');
    if (!res.ok) fail('manifest 取不到：HTTP ' + res.status);
    else manifest = await res.json();
  }
  out.info.manifest = manifest;
  if (manifest) {
    if (manifest.display !== 'standalone') fail('manifest.display 应为 standalone，实际 ' + manifest.display);
    if (!manifest.name) fail('manifest.name 为空');
    if (!manifest.short_name) fail('manifest.short_name 为空（主屏图标下没有名字）');
    if (manifest.start_url !== '/') fail('manifest.start_url 应为 /，实际 ' + manifest.start_url);
    if (manifest.scope !== '/') fail('manifest.scope 应为 /，实际 ' + manifest.scope);
    const icons = manifest.icons ?? [];
    const has = (size, purpose) => icons.some(i => i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose));
    if (!has('192x192', 'any')) fail('manifest 缺少 192x192 图标');
    if (!has('512x512', 'any')) fail('manifest 缺少 512x512 图标');
    if (!has('512x512', 'maskable')) fail('manifest 缺少 512x512 maskable 图标');
  }

  // 图标与启动图必须真的取得到，且像素尺寸与声明一致
  const imageSize = async (url) => {
    const res = await fetch(url);
    if (!res.ok) return { status: res.status };
    const bitmap = await createImageBitmap(await res.blob());
    return { status: 200, width: bitmap.width, height: bitmap.height };
  };

  out.info.icons = [];
  for (const icon of (manifest && manifest.icons) || []) {
    const [w, h] = icon.sizes.split('x').map(Number);
    const size = await imageSize(new URL(icon.src, location.origin).href);
    out.info.icons.push({ src: icon.src, ...size });
    if (size.status !== 200) fail('图标取不到：' + icon.src + '（HTTP ' + size.status + '）');
    else if (size.width !== w || size.height !== h) fail('图标尺寸不符：' + icon.src + ' 实为 ' + size.width + 'x' + size.height);
  }

  const appleTouch = document.querySelector('link[rel="apple-touch-icon"]');
  if (!appleTouch) fail('缺少 <link rel="apple-touch-icon">（iOS 主屏图标）');
  else {
    const size = await imageSize(appleTouch.href);
    out.info.appleTouchIcon = size;
    if (size.status !== 200) fail('apple-touch-icon 取不到');
    else if (size.width !== 180 || size.height !== 180) fail('apple-touch-icon 应为 180x180，实为 ' + size.width + 'x' + size.height);
  }

  const meta = (name) => document.querySelector('meta[name="' + name + '"]')?.content ?? null;
  const WEB_APP_META = {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': null,
    'theme-color': null,
    'format-detection': 'telephone=no',
  };
  out.info.meta = {};
  for (const [name, expected] of Object.entries(WEB_APP_META)) {
    const value = meta(name);
    out.info.meta[name] = value;
    if (value === null) fail('缺少 <meta name="' + name + '">');
    else if (expected !== null && value !== expected) fail('meta ' + name + ' 应为 ' + expected + '，实为 ' + value);
  }

  // 启动图：文件名 ipad-<宽>x<高> 是像素尺寸，media 查询是 CSS 尺寸（2 倍屏）
  const startups = [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')];
  out.info.startupImages = startups.length;
  if (startups.length === 0) fail('没有任何 apple-touch-startup-image（独窗启动会白屏）');
  for (const startup of startups) {
    const file = new URL(startup.href).pathname.split('/').pop() ?? '';
    const m = /^ipad-(\\d+)x(\\d+)\\.png$/.exec(file);
    if (!m) { fail('启动图命名不合规：' + file); continue; }
    const [fileW, fileH] = [Number(m[1]), Number(m[2])];
    const media = startup.media;
    const cssW = Number(/device-width:\\s*(\\d+)px/.exec(media)?.[1]);
    const cssH = Number(/device-height:\\s*(\\d+)px/.exec(media)?.[1]);
    const orientation = /orientation:\\s*(\\w+)/.exec(media)?.[1];
    const dpr = Number(/-webkit-device-pixel-ratio:\\s*(\\d+)/.exec(media)?.[1]);
    if (dpr !== 2) fail('启动图 media 未声明 2 倍屏：' + file);
    const expect = orientation === 'landscape' ? [cssH, cssW] : [cssW, cssH];
    if (expect[0] * 2 !== fileW || expect[1] * 2 !== fileH) {
      fail('启动图尺寸与 media 对不上：' + file + ' ↔ ' + media);
    }
    if (!orientation) fail('启动图 media 未声明 orientation：' + file);
  }

  // 抽查第一张启动图真的能加载
  const firstStartup = startups[0];
  if (firstStartup) {
    const file = new URL(firstStartup.href).pathname.split('/').pop();
    const size = await imageSize(firstStartup.href);
    out.info.firstStartup = { file, ...size };
    if (size.status !== 200) fail('启动图取不到：' + file);
  }

  return out;
})()`;

/** 页面侧断言：独立窗口态。 */
const STANDALONE_CHECKS = `(() => {
  const out = {};
  const root = document.documentElement;
  out.classes = root.className;
  out.isStandalone = root.classList.contains('is-standalone');
  out.isIos = root.classList.contains('is-ios');
  out.safeTop = getComputedStyle(root).getPropertyValue('--app-safe-top').trim();
  out.safeBottom = getComputedStyle(root).getPropertyValue('--app-safe-bottom').trim();
  const page = document.querySelector('.app-page');
  out.pagePaddingTop = page ? getComputedStyle(page).paddingTop : null;
  out.hasPill = !!document.querySelector('[data-testid="add-to-home-screen"]');
  out.scrollWidth = root.scrollWidth;
  out.innerWidth = window.innerWidth;
  out.bodyBg = getComputedStyle(document.body).backgroundColor;
  return out;
})()`;

/** 页面侧断言：浏览器态（只看胶囊是否出现/消失）。 */
const PILL_QUERY = `(() => {
  const root = document.documentElement;
  return {
    isIos: root.classList.contains('is-ios'),
    isStandalone: root.classList.contains('is-standalone'),
    hasPill: !!document.querySelector('[data-testid="add-to-home-screen"]'),
    pillText: document.querySelector('[data-testid="add-to-home-screen"]')?.textContent?.trim() ?? null,
  };
})()`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 等某个选择器出现，超时返回 false（页面依赖后端的场合不能直接判失败）。
 *
 * @param cdp CDP 客户端
 * @param sessionId 目标页会话
 * @param selector CSS 选择器
 * @param timeoutMs 最长等待毫秒数
 */
async function waitForSelector(cdp, sessionId, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evaluate(cdp, sessionId, `!!document.querySelector(${JSON.stringify(selector)})`);
    if (found) return true;
    await sleep(200);
  }
  return false;
}

async function waitForPill(cdp, sessionId, expected) {
  for (let i = 0; i < 40; i++) {
    const state = await evaluate(cdp, sessionId, PILL_QUERY);
    if (state.hasPill === expected) return state;
    await sleep(100);
  }
  return evaluate(cdp, sessionId, PILL_QUERY);
}

/**
 * 截一张全屏图到临时目录，返回路径（--keep-screenshot 时才调用）。
 *
 * @param cdp CDP 客户端
 * @param sessionId 目标页会话
 * @param name 文件名（落在系统临时目录）
 */
async function shoot(cdp, sessionId, name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const shotPath = path.join(os.tmpdir(), name);
  await fsp.writeFile(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(`  · 截图 ${shotPath}`);
  return shotPath;
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('dist/ 不存在，请先 npm run build');
  }

  const edge = findEdge();
  const { server, port } = await startStaticServer();
  const origin = `http://127.0.0.1:${port}`;
  const debugPort = await freePort();
  const profileDir = path.join(os.tmpdir(), `pwa-check-${process.pid}`);

  const browser = (await import('node:child_process')).spawn(
    edge,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  let sessionId;
  let targetId;
  try {
    // 等调试端口起来
    let wsUrl = null;
    for (let i = 0; i < 100 && !wsUrl; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        wsUrl = (await res.json()).webSocketDebuggerUrl;
      } catch {
        await sleep(150);
      }
    }
    if (!wsUrl) throw new Error('无头 Edge 的调试端口没起来');

    cdp = await Cdp.connect(wsUrl);
    ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    console.log('\n[1] 桌面浏览器：清单与静态资源');
    await navigate(cdp, sessionId, `${origin}/lang`);
    const content = await evaluate(cdp, sessionId, CONTENT_CHECKS);
    check(content.info.manifestUrl.endsWith('/manifest.webmanifest'), 'index.html 引用了 /manifest.webmanifest', content.info.manifestUrl);
    check((content.info.manifestType ?? '').includes('manifest'), 'manifest 的 Content-Type 是 manifest+json', content.info.manifestType);
    check(content.problems.length === 0, '清单 / meta / 图标 / 启动图逐项通过', content.problems);
    check(content.info.startupImages >= 14, `启动图覆盖 ${content.info.startupImages} 个 iPad 尺寸/方向`, content.info.startupImages);

    const desktop = await waitForPill(cdp, sessionId, false);
    check(!desktop.hasPill, '桌面浏览器不显示「添加到主屏幕」胶囊', desktop);

    console.log('\n[2] iPadOS 浏览器态：胶囊出现');
    await cdp.send(
      'Network.setUserAgentOverride',
      { userAgent: IPADOS_UA, platform: 'MacIntel', acceptLanguage: 'zh-CN' },
      sessionId,
    );
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true }, sessionId);
    await navigate(cdp, sessionId, `${origin}/lang`);
    const ipad = await waitForPill(cdp, sessionId, true);
    check(ipad.isIos, 'iPadOS（Macintosh UA + 多点触控）识别为 is-ios', ipad);
    check(!ipad.isStandalone, '浏览器态不误判为独立窗口', ipad);
    check(ipad.hasPill, '浏览器态显示「添加到主屏幕」胶囊', ipad);

    if (KEEP_SHOT) {
      await shoot(cdp, sessionId, 'ipad-browser-pill.png');
      await evaluate(cdp, sessionId, `document.querySelector('[data-testid="add-to-home-screen"]').click(); true`);
      const dialogReady = await waitForSelector(cdp, sessionId, '[role="dialog"]', 5000);
      check(dialogReady, '胶囊点开是三步引导弹窗');
      if (dialogReady) {
        const steps = await evaluate(
          cdp,
          sessionId,
          `(() => {
            const dialog = document.querySelector('[role="dialog"]');
            return {
              title: dialog.querySelector('h2')?.textContent?.trim() ?? null,
              steps: [...dialog.querySelectorAll('ol li')].length,
              pixels: getComputedStyle(dialog).backgroundColor,
            };
          })()`,
        );
        check(steps.title !== null, '弹窗有标题', steps.title);
        check(steps.steps === 3, '弹窗里是 3 步说明', steps.steps);
        await shoot(cdp, sessionId, 'ipad-browser-guide.png');
        await evaluate(cdp, sessionId, `document.querySelector('[role="dialog"] button[type="button"]')?.click(); true`);
      }
      // 胶囊真正会长期待着的地方是菜单页，顺手拍一张看它有没有压住购物车栏
      await navigate(cdp, sessionId, `${origin}/`);
      await waitForSelector(cdp, sessionId, '.landscape-container', 15000);
      await shoot(cdp, sessionId, 'ipad-browser-menu.png');
    }

    console.log('\n[3] 独窗态：无边框标记与安全区');
    // 在任何页面脚本之前把独窗标志伪装好：iOS 看 navigator.standalone，其他浏览器看 display-mode
    await cdp.send(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `(() => {
          const origMatchMedia = window.matchMedia.bind(window);
          const matches = (query) => {
            const mql = origMatchMedia(query);
            return new Proxy(mql, { get(target, prop) {
              if (prop === 'matches') return true;
              const value = Reflect.get(target, prop, target);
              return typeof value === 'function' ? value.bind(target) : value;
            } });
          };
          window.matchMedia = (query) =>
            typeof query === 'string' && query.includes('display-mode') ? matches(query) : origMatchMedia(query);
          Object.defineProperty(window.navigator, 'standalone', { get: () => true, configurable: true });
        })();`,
      },
      sessionId,
    );
    await navigate(cdp, sessionId, `${origin}/lang`, '.app-page');
    const standalone = await evaluate(cdp, sessionId, STANDALONE_CHECKS);
    check(standalone.isStandalone, '<html> 打上 is-standalone', standalone.classes);
    check(standalone.isIos, '<html> 打上 is-ios', standalone.classes);
    check(standalone.pagePaddingTop === '20px', '.app-page 顶部留出状态栏高度（20px）', {
      paddingTop: standalone.pagePaddingTop,
      safeTopVar: standalone.safeTop,
    });
    check(standalone.scrollWidth <= standalone.innerWidth, '独窗里没有横向溢出（无边框不露出滚动条）', {
      scrollWidth: standalone.scrollWidth,
      innerWidth: standalone.innerWidth,
    });
    check(standalone.safeBottom === '0px', '--app-safe-bottom 不被强行抬高（只有顶部让状态栏）', standalone.safeBottom);
    const hiddenPill = await waitForPill(cdp, sessionId, false);
    check(!hiddenPill.hasPill, '独窗里不再显示安装胶囊', hiddenPill);

    // 菜单页是 100dvh 整屏布局，单独看它的安全区
    await navigate(cdp, sessionId, `${origin}/`);
    const menuReady = await waitForSelector(cdp, sessionId, '.landscape-container', 15000);
    if (!menuReady) {
      console.log('  ! 菜单页 15 秒内没进到 .landscape-container（多半是拿不到菜单数据）');
    }
    const menu = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const box = document.querySelector('.landscape-container');
        const style = box && getComputedStyle(box);
        return {
          hasMenu: !!box,
          paddingTop: style ? style.paddingTop : null,
          height: style ? style.height : null,
          innerHeight: window.innerHeight,
          viewport: document.querySelector('meta[name="viewport"]')?.content ?? null,
        };
      })()`,
    );
    if (menu.hasMenu) {
      check(menu.paddingTop === '20px', '菜单页整屏容器避开了状态栏', menu.paddingTop);
    } else {
      // 数据没拉到时会停在 loading（min-h-screen），不做断言但要说清楚
      console.log('  · 菜单页仍停在加载态，跳过 .landscape-container 断言');
    }
    check(/width=1067/.test(menu.viewport ?? ''), '独窗里仍然套用 iPad 的 1067 布局宽度', menu.viewport);

    if (KEEP_SHOT) {
      await shoot(cdp, sessionId, 'ipad-standalone-menu.png');
    }
  } finally {
    // 先走 CDP 的 Browser.close：Edge 的入口进程会把真正的浏览器进程再 fork 一个，
    // 只按我们拿到的 PID 结束进程树会漏掉后面这层，留下无头实例空转。
    try {
      await cdp?.send('Browser.close');
    } catch {
      // 没连上或已退出
    }
    cdp?.close();
    server.closeAllConnections?.();
    server.close();
    if (targetId) {
      try {
        execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // 浏览器可能已经自己退了
      }
    }
    browser.unref();
    await sleep(500);
    await fsp.rm(profileDir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }

  console.log('');
  if (failures.length > 0) {
    console.log(`✗ ${failures.length} 项未通过：`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  console.log('✓ iPadOS 无边框独立运行：全部检查通过');
  // 子进程 / 调试端口偶尔留着手柄不放，这里显式收尾，避免校验跑完卡住不退出
  process.exit(0);
}

await main();
