# 出餐展示屏 · 桌面无边框窗口

把点餐系统的「出餐展示」（`/admin/display`）做成桌面上的一个图标：双击就全屏铺满指定显示器，
没有地址栏、没有标题栏、没有任务栏，像原生 App。

```
desktop/
├── install-desktop.cmd     双击这个 → 在桌面生成「出餐展示屏」快捷方式
├── install-desktop.ps1     上面那个的实体（也支持 -Uninstall / -Startup）
├── order-screen.ps1        启动器：用 Edge kiosk 打开页面
└── assets/order-screen.ico 快捷方式图标（npm run generate:pwa 生成）
```

## 装一次

双击 `install-desktop.cmd`，桌面上会出现「出餐展示屏」图标。之后双击它即可。

开机自动打开：再加 `-Startup`（会往「启动」文件夹也放一个快捷方式）。

卸载：`install-desktop.cmd -Uninstall`。

## 放到外接显示屏上

出餐屏开在哪块屏，由 `-Monitor` 的序号决定（1＝主屏，2＝第二块屏……）。

**第 1 步：确认哪块是外接屏。** 在项目目录跑：

```powershell
powershell -ExecutionPolicy Bypass -File desktop\order-screen.ps1 -List
```

输出类似（本机实测）：

```
可用显示器（-Monitor 的序号就是这里的编号）:
  1. \\.\DISPLAY1  2560x1600 @ (0,0)  [主屏]
     显示器：NE160QDM-NYJ   适配器：AMD Radeon(TM) 610M
  2. \\.\DISPLAY6  3840x2160 @ (-3840,0)
     显示器：LG HDR 4K   适配器：NVIDIA GeForce RTX 4060 Laptop GPU
```

「显示器」那行是 EDID 型号（来自 WMI），虚拟显示器（GameViewer / ToDesk / Parsec 等）会被标出来，别选。

**第 2 步：让快捷方式记住这块屏。**

```powershell
powershell -ExecutionPolicy Bypass -File desktop\install-desktop.ps1 -ExtraArgs "-Monitor 2"
```

本机已经按 `-Monitor 2`（LG HDR 4K，3840×2160）装好了，双击图标即落在外接屏。

**注意几点**

- Windows 显示设置里必须是「**扩展**这些显示器」；「复制」模式下两块屏是一个桌面，铺不满也不独立。
- 外接屏拔掉时 `-Monitor 2` 会自动回落到主屏（不会报错、也不会开不出来）。
- 多屏缩放不同（如 4K@150% + 内屏@100%）已处理：启动器声明了 per-monitor DPI 感知，
  读到的坐标与真实像素一致，窗口正好铺满该屏、不会偏。

## 启动器参数

| 参数 | 说明 |
| --- | --- |
| `-Page display\|orders` | `display`＝出餐展示（默认，带 `?kiosk=1` 直接全屏展示）；`orders`＝订单管理 / 出餐台 |
| `-Monitor N` | 显示器序号，1＝主屏，2＝第二块屏……（跑 `-List` 看对照表） |
| `-List` | 只列出显示器的序号 / 分辨率 / 位置 / 型号 / 适配器，不启动窗口 |
| `-Windowed` | 不开全屏，改开普通应用窗口（有标题栏、可拖动） |
| `-Width/-Height/-X/-Y` | 只配 `-Windowed`：窗口尺寸与位置 |
| `-Wait` | 等窗口关掉才返回（默认塞完参数就退出，Edge 自己活着） |
| `-EdgePath` | 指定 msedge.exe（默认自动找 Program Files / LocalAppData） |

## 关闭

kiosk 窗口没有关闭按钮：`Alt+F4`。切到别的程序用 `Alt+Tab` / 徽标键。

## 登录

后台页面要管理员密码，所以每次冷启动会先停在登录页；登录后自动跳回
`/admin/display?kiosk=1`（`AdminGuard` 会带 `?next=`，登录页据此回调）。
登录态存在 `sessionStorage`，窗口一关就没了——这是现有后台的设计，没动。

## 日志

`%LOCALAPPDATA%\zct-order-screen\launcher.log` 记录每次启动的 URL、显示器、窗口尺寸。
Edge 用独立配置目录 `%LOCALAPPDATA%\zct-order-screen\edge-profile`，和日常浏览完全隔离。

## 实现说明（为什么是 kiosk）

- Windows 上 Edge 的 `--app` 应用窗口自带标题栏；把 `WS_CAPTION` / DWM 扩展边框都去掉之后
  Chromium 会自己再画一条标题栏，从外部去不干净（实测过两种改法）。
- `--kiosk` 是 Chromium 自己的无边框全屏：窗口 rect 正好等于显示器 bounds、样式里没有
  `WS_CAPTION`，任务栏也被盖住——这才是真「无边框」。
- kiosk 忽略 `--window-size`，但**会**用 `--window-position` 决定落在哪块屏，所以
  `-Monitor` 靠这点生效。
