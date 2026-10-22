# 🍜 自助点餐系统

独立部署于 Vercel + Supabase 的点餐系统，已脱离秒哒平台。

## 线上地址

| 入口 | URL |
|------|-----|
| 顾客端 | [app-cor1b70nj9xd.vercel.app](https://app-cor1b70nj9xd.vercel.app) |
| 管理端 | [app-cor1b70nj9xd.vercel.app/admin/login](https://app-cor1b70nj9xd.vercel.app/admin/login) |

## 架构

```
React 18 + Vite + Tailwind 3
         │
    ┌────┴────┐
    ▼         ▼
  Vercel   Supabase
 (Hosting) (PostgreSQL)

  GitHub CI/CD: push → 自动构建部署
```

## iPad 无边框独立运行 📱

顾客桌上的 iPad 用「添加到主屏幕」启动，页面就像原生 App：没有地址栏、没有工具栏，状态栏浮在内容上，四边到边。

### 在 iPad 上装一次

1. 用 Safari 打开站点；
2. 点顶部「分享」→「添加到主屏幕」；
3. 点右上角「添加」，之后从主屏图标启动就是全屏独立运行。

浏览器里打开时，左下角会浮一个「添加到桌面 · 全屏运行」胶囊，点开就是同样三步；点 × 后这台设备不再提示（记在 `localStorage` 的 `zct-order:a2hs-dismissed`）。

### 各部分在哪

| 作用 | 位置 |
| --- | --- |
| 清单（`display: standalone`、图标、主题色） | `public/manifest.webmanifest` |
| Apple 专有 meta + 各代 iPad 启动图 | `index.html` |
| 图标与启动图位图 | `public/icons/`、`public/splash/`（脚本生成，别手改） |
| 首帧独窗标记 `<html class="is-standalone is-ios">` | `index.html` 的内联脚本 |
| 安全区变量与整页容器 | `src/index.css` 的 `--app-safe-top/bottom`、`.app-page`、`.landscape-container` |
| 安装引导胶囊与弹窗 | `src/components/common/AddToHomeScreen.tsx` |
| 四语言引导文案 | `src/i18n/translations.ts` 的 `pwa` 段 |

### 改图标 / 换机型

```bash
npm run generate:pwa   # 从 public/favicon.jpg 重新生成图标与全部启动图
npm run build
npm run check:pwa      # 起本地静态服务 + 无头 Edge，逐项验清单、图标、启动图、独窗行为
```

`check:pwa` 会断言：清单字段与图标尺寸对得上、每张启动图的像素尺寸与 media 查询一致、桌面浏览器不乱弹安装提示、iPadOS 浏览器态出现胶囊、独窗态 `<html>` 带上 `is-standalone` 且 `.app-page` 真的让出 20px 状态栏、页面没有横向溢出。加 `--keep-screenshot` 会在系统临时目录留截图；加 `--base-url=https://app-cor1b70nj9xd.vercel.app` 直接复验线上（发布后跑这条）。

新机型只要在 `scripts/generate-pwa-assets.mjs` 的 `IPAD_SIZES` 里加一行 CSS 尺寸，重跑 `npm run generate:pwa`，再在 `index.html` 补一对竖/横屏 `apple-touch-startup-image`（媒体查询是 CSS 尺寸，文件名是 2 倍像素）。

### 注意

- 状态栏是 `black-translucent`（浮在内容上），新页面的根节点要用 `.app-page`（或菜单页那类整屏布局的 `.landscape-container`），否则顶栏会钻到时钟下面。
- 只有 Safari 能把网页添加到主屏幕；引导里已经写明「换 Safari 打开」。
- 结账、付款、下单成功页和后台页面不显示引导胶囊，免得在收银流程上多盖一层。

## 出餐展示屏（桌面无边框窗口）🖥️

把「出餐展示」做成桌面上的一个图标：双击就全屏铺满指定显示器，没有地址栏、标题栏和任务栏。

双击 `desktop\install-desktop.cmd` → 桌面出现「出餐展示屏」图标。细节（换显示器、开机自启、参数、卸载）见 [desktop/README.md](desktop/README.md)。

- 启动器 `desktop\order-screen.ps1` 用 Edge kiosk 模式打开 `/admin/display?kiosk=1`，`-Monitor N` 指定落在哪块屏。
- 放到外接显示屏：先跑 `order-screen.ps1 -List` 看序号（会显示 EDID 型号，虚拟显示器会被标出），再用 `install-desktop.ps1 -ExtraArgs "-Monitor 2"` 重装图标。Windows 侧需是「扩展」显示模式；多屏缩放不同已按 per-monitor DPI 处理。
- 页面侧配套改动：未登录访问后台深链会带上 `?next=`，登录后跳回原目标；出餐展示带 `?kiosk=1` 时直接进全屏展示态（不显示后台侧栏）。
- 关闭用 `Alt+F4`；日志在 `%LOCALAPPDATA%\zct-order-screen\launcher.log`。

## 打印站配置 🖨️

在收款台电脑上部署全屏 Kiosk 打印站（推荐走 `print-station/` 里的启动器，它会在开浏览器前先自检打印机）：

```powershell
powershell -ExecutionPolicy Bypass -File print-station\install-shortcut.ps1   # 重建桌面/启动项快捷方式
```

### 不出纸时（打印机识别通路）

打印站的静默打印依赖「浏览器默认打印机 → 队列 → 真实 USB 端口」这条链路。标签机换过 USB 口后，
Windows 会新建 `HPRT HM-T260LR (副本 N)` 队列，主队列却还绑在已消失的 USB 口上，默认打印机和 Chrome
记住的打印目标都指向它 —— 表现就是**作业进队列、纸不出来**（端口错位还会让队列被标成「脱机」）。

```powershell
powershell -ExecutionPolicy Bypass -File print-station\fix-printer.ps1 -WhatIfOnly   # 先看诊断
powershell -ExecutionPolicy Bypass -File print-station\fix-printer.ps1              # 清卡单 + 改绑端口 + 设默认 + 解脱机
```

打印站页面右上角的**「测试打印」**可以直接验证这条通路（不用等订单）。细节见 [print-station/README.md](print-station/README.md)。

### 手动部署（老办法）

创建 Chrome 快捷方式，目标：
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="%TEMP%\chrome-kiosk-print" "https://app-cor1b70nj9xd.vercel.app/"
```

或运行 `docs\install-print-station.bat`（生成桌面快捷方式 + 开机自启）。

退出 Kiosk：`Alt+F4`

## 支付二维码 ⚡

付款页的微信 / 支付宝 / PayPay 二维码随前端一起发布（`src/assets/payment-qr/`），点「提交订单」立刻出码，不再等跨境 CDN 上的 100–240KB 原图。

- **换码**：照旧在「管理 → 支付配置」上传。后台地址变了以后，付款页先显示打包图顶着，新图下载完自动替换，并写进浏览器 Cache Storage，之后同一台设备直接命中缓存。
- **恢复首帧出码**：发布一次即可。`npm run build` 的 `prebuild` 会跑 `scripts/sync-payment-qr.mjs`，从后台拉当前二维码重新生成打包图（网络/后台不可用时跳过、沿用旧图，不阻断发布）。也可以手动 `npm run sync:qr`。

## 本地开发

```bash
npm install
npm run dev
```

## 部署

```bash
# 构建
npm run build

# 推送到 GitHub（自动触发 Vercel 部署）
git add -A && git commit -m "update" && git push
```

或使用管理脚本：
```bash
python scripts/manage.py deploy "更新说明"
```

## 目录结构

```
├── src/
│   ├── pages/user/        # 顾客端页面
│   ├── pages/admin/       # 管理端页面
│   ├── components/        # UI 组件 (shadcn/ui)
│   ├── contexts/          # React 状态管理
│   └── db/supabase.ts     # Supabase 客户端
├── public/                # 静态资源
├── supabase/migrations/   # 数据库迁移
├── docs/                  # 部署文档 + 打印站脚本
├── vercel.json            # SPA 路由配置
└── package.json
```

## 技术栈

Vite · TypeScript · React 18 · Tailwind 3 · Supabase · Radix UI · shadcn/ui
