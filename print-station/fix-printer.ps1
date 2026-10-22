<#
.SYNOPSIS
  修复热敏标签打印机的「队列 → USB 端口」错位，让打印站能真的出纸。

.DESCRIPTION
  HPRT HM-T260LR 换过 USB 口之后，Windows 会在新口上再建一个「副本 N」队列，
  而原来的 `HPRT HM-T260LR` 队列还绑在已经不存在的 USB 口上。默认打印机、以及
  Chrome kiosk 配置里记住的打印目标，都还是那个死队列——于是打印站「提交成功、
  不出纸」，作业堆在队列里（StatusMask=0、永远 Normal）。

  本脚本做四件事：
    1. 从 PnP 里找出打印机当前真正挂在哪个 USB 端口（状态 OK 的那个）；
    2. 把主队列（默认名 HPRT HM-T260LR）重新绑到那个端口；
    3. 把主队列设为默认打印机（浏览器静默打印只认默认打印机）；
    4. 清掉卡在队列里的历史作业（-KeepJobs 可保留）。

  只动端口绑定与默认打印机，不动队列名，所以每台队列的纸张/走纸设置
  （HKCU\Printers\DevModePerUser）保持原样。

.PARAMETER PrinterName
  主队列名，默认 `HPRT HM-T260LR`。

.PARAMETER Match
  识别打印机用的 PnP 名称关键字（正则），默认匹配 HPRT / HM-T260。

.PARAMETER KeepJobs
  不清空队列里的历史作业。

.PARAMETER WhatIfOnly
  只报告诊断结果，不做任何修改。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File print-station\fix-printer.ps1

.EXAMPLE
  # 只看看现在是什么情况
  powershell -ExecutionPolicy Bypass -File print-station\fix-printer.ps1 -WhatIfOnly
#>
[CmdletBinding()]
param(
  [string]$PrinterName = 'HPRT HM-T260LR',
  [string]$Match = 'HPRT|HM-T260',
  [switch]$KeepJobs,
  [switch]$WhatIfOnly
)

$ErrorActionPreference = 'Stop'
$changed = $false

function Get-LiveUsbPort {
  param([string]$Pattern)

  # 状态 OK 的打印机类 PnP 实例，InstanceId 形如 USBPRINT\HPRTHM-T260LR\7&2D6F0&0&USB004
  $instances = Get-PnpDevice -Class Printer -ErrorAction SilentlyContinue |
    Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -match $Pattern }
  foreach ($instance in $instances) {
    if ($instance.InstanceId -match 'USBPRINT\\.+&0&(USB\d{3})$') { return $matches[1] }
  }
  return $null
}

# ── 1. 现在是什么情况 ──
Write-Host '=== 打印机现状 ==='
$livePort = Get-LiveUsbPort -Pattern $Match
if (-not $livePort) {
  Write-Host '✗ 找不到状态正常的打印机 USB 实例：请确认打印机已开机、USB 线插好。'
  exit 2
}
Write-Host ("实际连接端口（PnP 状态 OK）：{0}" -f $livePort)

$queues = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $Match })
if ($queues.Count -eq 0) { Write-Host '✗ 系统里没有这台打印机的队列。'; exit 3 }

foreach ($queue in $queues) {
  $flag = ''
  if ($queue.Name -eq $PrinterName) { $flag += ' [主队列]' }
  if ($queue.PortName -eq $livePort) { $flag += ' [端口正确]' } else { $flag += ' [端口是死的]' }
  Write-Host ("  {0,-26} 端口 {1,-7}{2}" -f $queue.Name, $queue.PortName, $flag)
}

$main = $queues | Where-Object { $_.Name -eq $PrinterName } | Select-Object -First 1
if (-not $main) { Write-Host ("✗ 没有名为 {0} 的队列，可用 -PrinterName 指定。" -f $PrinterName); exit 3 }

$defaultName = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name
Write-Host ("当前默认打印机：{0}" -f ($(if ($defaultName) { $defaultName } else { '<无>' })))
Write-Host ''

# ── 2. 先清掉卡住的作业 ──
# 顺序很重要：先清再改端口。反过来的话，端口一改，spooler 会把积压的旧作业一次性全吐出来。
if ($WhatIfOnly) {
  $pending = @(Get-PrintJob -PrinterName $main.Name -ErrorAction SilentlyContinue).Count
  Write-Host ("队列里当前卡着 {0} 个作业" -f $pending)
  Write-Host '(-WhatIfOnly：只诊断，不改动)'
  exit 0
}

$jobs = @(Get-PrintJob -PrinterName $main.Name -ErrorAction SilentlyContinue)
if ($jobs.Count -gt 0) {
  if ($KeepJobs) {
    Write-Host ("· 队列里还有 {0} 个作业（-KeepJobs，未清）" -f $jobs.Count)
  } else {
    Write-Host ("→ 清掉队列里卡住的 {0} 个作业" -f $jobs.Count)
    foreach ($job in $jobs) {
      try { Remove-PrintJob -PrinterName $main.Name -ID $job.Id -ErrorAction Stop } catch {
        Write-Host ('  ! 删作业 {0} 失败：{1}' -f $job.Id, $_.Exception.Message)
      }
    }
    Start-Sleep -Milliseconds 500
    $left = @(Get-PrintJob -PrinterName $main.Name -ErrorAction SilentlyContinue).Count
    Write-Host ("  ✓ 剩余作业：{0}" -f $left)
    $changed = $true
  }
} else {
  Write-Host '✓ 队列是空的'
}

# ── 3. 修端口 ──
if ($main.PortName -ne $livePort) {
  Write-Host ("→ 把 {0} 从 {1} 改绑到 {2}" -f $main.Name, $main.PortName, $livePort)
  Set-Printer -Name $main.Name -PortName $livePort
  $changed = $true
  Start-Sleep -Milliseconds 500
  $after = Get-Printer -Name $main.Name
  if ($after.PortName -ne $livePort) { Write-Host ("✗ 改端口失败，仍是 {0}" -f $after.PortName); exit 4 }
  Write-Host '  ✓ 端口已改'
} else {
  Write-Host ("✓ {0} 已经绑在 {1}" -f $main.Name, $livePort)
}

# ── 4. 默认打印机 ──
if ($defaultName -ne $main.Name) {
  Write-Host ("→ 把默认打印机设为 {0}" -f $main.Name)
  (New-Object -ComObject WScript.Network).SetDefaultPrinter($main.Name)
  $changed = $true
  Start-Sleep -Milliseconds 500
  $defaultName = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name
  if ($defaultName -ne $main.Name) { Write-Host ("✗ 设默认打印机失败，现在是 {0}" -f $defaultName); exit 5 }
  Write-Host '  ✓ 默认打印机已切换'
} else {
  Write-Host ("✓ 默认打印机已经是 {0}" -f $main.Name)
}

# ── 5. 清掉「脱机使用打印机」 ──
# 端口绑错了以后，spooler 会把队列标成脱机（registry Attributes 里 0x400 位），
# 之后即使端口改对，作业也只进不出。这一步解除脱机并把标记写回注册表。
$wmiQueue = Get-CimInstance Win32_Printer -Filter ("Name='{0}'" -f $main.Name)
$attributes = (Get-ItemProperty -Path ("HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers\{0}" -f $main.Name) -ErrorAction SilentlyContinue).Attributes
$offlineByWmi = [bool]$wmiQueue.WorkOffline
$offlineByReg = ($attributes -ne $null) -and (($attributes -band 0x400) -ne 0)

if ($offlineByWmi -or $offlineByReg) {
  Write-Host ("→ 队列处于脱机状态（WMI={0}，注册表位={1}），解除" -f $offlineByWmi, $offlineByReg)
  Set-CimInstance -InputObject $wmiQueue -Property @{ WorkOffline = $false } -ErrorAction Stop
  $changed = $true
  Start-Sleep -Milliseconds 800
  $recheck = Get-CimInstance Win32_Printer -Filter ("Name='{0}'" -f $main.Name)
  $recheckAttr = (Get-ItemProperty -Path ("HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers\{0}" -f $main.Name) -ErrorAction SilentlyContinue).Attributes
  if ($recheck.WorkOffline -or ((($recheckAttr -ne $null) -and (($recheckAttr -band 0x400) -ne 0)))) {
    Write-Host '  ✗ 脱机标记没清掉（可能需要管理员权限）'
    exit 6
  }
  Write-Host '  ✓ 已解除脱机'
} else {
  Write-Host '✓ 队列不是脱机状态'
}

# ── 6. 复核 ──
Write-Host ''
Write-Host '=== 修复后 ==='
$final = Get-Printer -Name $main.Name
$finalWmi = Get-CimInstance Win32_Printer -Filter ("Name='{0}'" -f $main.Name)
$finalDefault = (Get-CimInstance Win32_Printer | Where-Object { $_.Default }).Name
Write-Host ("  {0} → 端口 {1}，状态 {2}，默认={3}，脱机={4}" -f $final.Name, $final.PortName, $final.PrinterStatus, ($finalDefault -eq $final.Name), $finalWmi.WorkOffline)
Write-Host ("  队列里还有 {0} 个作业" -f @(Get-PrintJob -PrinterName $main.Name -ErrorAction SilentlyContinue).Count)
Write-Host ''
Write-Host '下一步：双击桌面「打印站」图标（Chrome kiosk）→ 在打印站里点任意一条「重打」，'
Write-Host '        或下一笔订单到达，标签应能直接出纸。'
if ($changed) { Write-Host '（本次有改动：若 Chrome 里之前手动选过别的打印机，可能需要在打印对话框里再确认一次。）' }
exit 0
