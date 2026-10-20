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

## 打印站配置 🖨️

在收款台电脑上部署全屏 Kiosk 打印站：

### 方式一：快捷方式

创建 Chrome 快捷方式，目标：
```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="%TEMP%\chrome-kiosk-print" "https://app-cor1b70nj9xd.vercel.app/"
```

### 方式二：一键安装

以管理员身份运行：
```
docs\install-print-station.bat
```
自动生成桌面快捷方式 + 开机自启。

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
