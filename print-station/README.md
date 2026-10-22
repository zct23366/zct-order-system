# 打印站 · 自检与自愈

打印站「提交成功但不出纸」时用这个目录里的脚本。它们治的是**打印机识别通路**，不是网页本身。

## 症状与根因

打印站用浏览器 `window.print()` 出纸，而浏览器只会打到**系统默认打印机**，且默认打印机绑的是
**队列 → USB 端口**。热敏标签机（HPRT HM-T260LR）换过一次 USB 口之后，Windows 会在新口上新建一个
`HPRT HM-T260LR (副本 N)` 队列，而原来的主队列还绑在已经不存在的 `USB001` 上：

```
HPRT HM-T260LR (副本 3)  端口 USB004   ← 打印机现在真的在这
HPRT HM-T260LR           端口 USB001   ← 默认打印机、Chrome 记住的打印目标，是死的
```

这时作业能进队列（所以页面显示「已打印」），但 spooler 永远发不出去；端口绑错还会把队列
标成「脱机使用打印机」，于是**即使端口改对了也照样不出纸**。两个症状合在一起，就是
「打印站无法自动打印」。

## 一键修复

```powershell
# 只诊断，不改动
powershell -ExecutionPolicy Bypass -File print-station\fix-printer.ps1 -WhatIfOnly

# 真修：清掉卡住的作业 → 主队列改绑到活的 USB 口 → 设为默认 → 解除脱机
powershell -ExecutionPolicy Bypass -File print-station\fix-printer.ps1
```

也可以直接双击 `fix-printer.cmd`。脚本是幂等的，打印机正常时再跑一遍只会全部报 ✓。

## 启动前自愈（推荐）

```powershell
powershell -ExecutionPolicy Bypass -File print-station\install-shortcut.ps1
```

这会把桌面的「打印站」快捷方式改成走 `start-print-station.ps1`：**每次启动先跑 fix-printer.ps1，
再拉起 Chrome kiosk**。换 USB 口、重启、拔插线都不会再静默失效。`-Startup` 可同时放进启动文件夹，
`-Remove` 卸载。

日志：`%LOCALAPPDATA%\zct-order-print\print-station.log`

## 页面里的「测试打印」

打印站右上角有「测试打印」按钮：不用等订单，直接打一张测试小票。能出纸就说明
「网页 → 浏览器 → 默认打印机 → USB」整条通路过。

## 手动判断

```powershell
# 队列里有没有卡住的作业（JobStatus 一直是 Normal、PagesPrinted=0 就是卡住）
Get-PrintJob -PrinterName 'HPRT HM-T260LR'

# 是否被标成脱机
Get-CimInstance Win32_Printer -Filter "Name='HPRT HM-T260LR'" | Select-Object WorkOffline, PrinterStatus

# 打印机插在哪个 USB 口（Status=OK 的那个才是活的）
Get-PnpDevice -Class Printer | Where-Object { $_.Status -eq 'OK' -and $_.InstanceId -match 'HPRT' } | Select-Object InstanceId
```

## 注意

- 不要删主队列 `HPRT HM-T260LR`：Chrome 的打印目标、每台队列的纸张/走纸设置都挂在它上面
  （设置存在 `HKCU\Printers\DevModePerUser`，按队列名分）。
- `(副本 1/2/3)` 是插不同 USB 口时 Windows 自动建的，可以留着不管；关键是主队列要绑在活的端口上。
- Chrome 的打印目标存在它自己的配置目录 `%LOCALAPPDATA%\chrome-kiosk-print`，如果谁在打印对话框里
  手动选过别的打印机，需要再选回 `HPRT HM-T260LR`。
