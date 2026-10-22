<#
.SYNOPSIS
  点餐系统「出餐展示」的无边框桌面窗口启动器。

.DESCRIPTION
  用 Edge 的 kiosk 模式打开线上页面：真正盖住整块屏幕，没有标题栏、没有浏览器边框，
  也没有任务栏。Chromium 用「窗口位置」来决定全屏落在哪块显示器上，所以 -Monitor 有效。

  专用浏览器配置目录：%LOCALAPPDATA%\zct-order-screen\edge-profile，
  与日常用的 Edge 完全隔离，登录态、缓存都自己一份。

  后台页需要管理员密码：首次启动停在登录页，登录后自动回到出餐展示
  （AdminGuard 会把原目标带进 ?next=，登录页据此跳回 /admin/display?kiosk=1）。

  退出：Alt+F4（kiosk 没有关闭按钮）。

.PARAMETER Page
  display = 出餐展示（/admin/display?kiosk=1，进来即全屏展示）
  orders  = 订单管理 / 出餐台（/admin/orders）

.PARAMETER Monitor
  显示器序号，1 = 主屏，2 = 第二块屏……（主屏排第一，其余按 Windows 的顺序）
  不确定哪个序号是外接屏时先跑 -List 看表。

.PARAMETER List
  只列出显示器（序号 / 分辨率 / 位置 / 型号 / 适配器 / 是否虚拟），不启动窗口。

.PARAMETER Windowed
  不要全屏，改开普通应用窗口（有标题栏、可拖动）。无边框只在全屏下成立：
  Windows 上的 Edge 应用窗口去不掉标题栏，想要「无边框」就别加这个开关。

.PARAMETER Width / Height / X / Y
  只对 -Windowed 生效：窗口尺寸与位置，不给就居中铺满该屏的工作区。

.PARAMETER Wait
  启动后等这个窗口关掉再返回（默认塞完参数就退出，Edge 自己活着）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File desktop\order-screen.ps1

.EXAMPLE
  # 先看有哪几块屏，再让出餐屏落到外接屏（这里是 2 号屏）
  powershell -ExecutionPolicy Bypass -File desktop\order-screen.ps1 -List
  powershell -ExecutionPolicy Bypass -File desktop\order-screen.ps1 -Monitor 2
#>
[CmdletBinding()]
param(
  [ValidateSet('display', 'orders')]
  [string]$Page = 'display',
  [string]$BaseUrl = 'https://app-cor1b70nj9xd.vercel.app',
  [int]$Monitor = 1,
  [switch]$List,
  [switch]$Windowed,
  [int]$Width = 0,
  [int]$Height = 0,
  [int]$X = [int]::MinValue,
  [int]$Y = [int]::MinValue,
  [switch]$Wait,
  [string]$EdgePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

# 列屏用：\\.\DISPLAYn → 适配器名 + 显示器型号（虚拟显示器在这里一眼能看出来）
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DisplayEnum
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DISPLAY_DEVICE
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }

    public const int DISPLAY_DEVICE_ATTACHED_TO_DESKTOP = 0x00000001;
    public const int DISPLAY_DEVICE_MIRRORING_DRIVER = 0x00000008;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    /// 按显示器 DPI 感知：多屏缩放不同时（例如 4K@150% + 内屏@100%），
    /// 不声明的话 PowerShell 读到的坐标是被折算过的，传给 Edge 的位置会偏。
    public static void MakeDpiAware()
    {
        // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
        if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) { SetProcessDPIAware(); }
    }

    /// 只返回真正接在桌面上的输出：DeviceName → [适配器名, 显示器型号]
    public static Dictionary<string, string[]> AttachedDisplayNames()
    {
        Dictionary<string, string[]> map = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        for (uint i = 0; ; i++)
        {
            DISPLAY_DEVICE adapter = new DISPLAY_DEVICE();
            adapter.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
            if (!EnumDisplayDevices(null, i, ref adapter, 0)) break;
            if ((adapter.StateFlags & DISPLAY_DEVICE_MIRRORING_DRIVER) != 0) continue;
            if ((adapter.StateFlags & DISPLAY_DEVICE_ATTACHED_TO_DESKTOP) == 0) continue;

            string monitor = "";
            string hardwareId = "";
            DISPLAY_DEVICE mon = new DISPLAY_DEVICE();
            mon.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
            if (EnumDisplayDevices(adapter.DeviceName, 0, ref mon, 0))
            {
                monitor = mon.DeviceString;
                // DeviceID 形如 MONITOR\GSM7706\{4d36e96e-...}\0001，第二段是 EDID 硬件 ID
                string[] parts = (mon.DeviceID ?? "").Split('\\');
                if (parts.Length > 1) { hardwareId = parts[1]; }
            }
            map[adapter.DeviceName] = new string[] { adapter.DeviceString, monitor, hardwareId };
        }
        return map;
    }
}
'@

# 先声明 DPI 感知，再读屏幕几何 —— 顺序不能反，Screen.AllScreens 会按当前的 DPI 虚拟化方式算一次
[DisplayEnum]::MakeDpiAware() | Out-Null

$logDir = Join-Path $env:LOCALAPPDATA 'zct-order-screen'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir 'launcher.log'

function Write-Log {
  param([string]$Message)
  $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

function Resolve-Edge {
  param([string]$Override)
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($Override) { $candidates.Add($Override) }
  if ($env:EDGE_PATH) { $candidates.Add($env:EDGE_PATH) }
  $roots = @(${env:ProgramFiles(x86)}, $env:ProgramFiles, $env:LOCALAPPDATA)
  foreach ($root in $roots) {
    if ($root) { $candidates.Add((Join-Path $root 'Microsoft\Edge\Application\msedge.exe')) }
  }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  throw '找不到 Edge（msedge.exe）。用 -EdgePath 指定完整路径。'
}

# ── 1. 目标页面 ──
$pagePath = '/admin/display?kiosk=1'
if ($Page -eq 'orders') { $pagePath = '/admin/orders' }
$url = $BaseUrl.TrimEnd('/') + $pagePath

# ── 2. 目标显示器（主屏排第一，-Monitor 按这个顺序数）──
$screens = [System.Windows.Forms.Screen]::AllScreens
$primary = $null
foreach ($screen in $screens) { if ($screen.Primary) { $primary = $screen } }
if (-not $primary) { $primary = $screens[0] }

$ordered = New-Object System.Collections.Generic.List[object]
$ordered.Add($primary)
foreach ($screen in $screens) { if (-not $screen.Primary) { $ordered.Add($screen) } }

$target = $ordered[0]
if ($Monitor -ge 1 -and $Monitor -le $ordered.Count) { $target = $ordered[$Monitor - 1] }

# ── 2b. -List：只报屏幕清单，不启动（换外接屏时先看这张表）──
if ($List) {
  $names = [DisplayEnum]::AttachedDisplayNames()

  # EDID 型号名（LG HDR 4K / NE160QDM-NYJ）：按硬件 ID 从 WMI 里对
  $friendlyNames = @{}
  try {
    foreach ($id in Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction Stop) {
      if ($id.InstanceName -match 'DISPLAY\\([^\\]+)\\') {
        $hardwareId = $matches[1]
        $friendlyNames[$hardwareId] = (-join ($id.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }))
      }
    }
  } catch {
    # 部分虚拟显示器或远程会话读不到 WMI，退回 EnumDisplayDevices 的描述即可
  }

  Write-Host '可用显示器（-Monitor 的序号就是这里的编号）:'
  $index = 1
  foreach ($screen in $ordered) {
    $adapterName = ''
    $monitorName = ''
    $entry = $null
    if ($names.ContainsKey($screen.DeviceName)) { $entry = $names[$screen.DeviceName] }
    if ($entry) {
      $adapterName = $entry[0]
      $monitorName = $entry[1]
      if ($entry.Length -gt 2 -and $friendlyNames.ContainsKey($entry[2])) { $monitorName = $friendlyNames[$entry[2]] }
    }

    $notes = ''
    if ($screen.Primary) { $notes += '  [主屏]' }
    if ($adapterName -match 'Virtual|GameViewer|ToDesk|Parsec|Spacedesk|USB Display|IddSample') { $notes += '  [虚拟显示器，别选]' }
    Write-Host ('  {0}. {1}  {2}x{3} @ ({4},{5}){6}' -f $index, $screen.DeviceName,
      $screen.Bounds.Width, $screen.Bounds.Height, $screen.Bounds.Left, $screen.Bounds.Top, $notes)
    if ($monitorName -or $adapterName) { Write-Host ('     显示器：{0}   适配器：{1}' -f $monitorName, $adapterName) }
    $index++
  }
  Write-Host ''
  Write-Host '用法：powershell -ExecutionPolicy Bypass -File desktop\order-screen.ps1 -Monitor <序号>'
  Write-Host '改桌面快捷方式：desktop\install-desktop.cmd -ExtraArgs "-Monitor <序号>"'
  return
}

# ── 3. 专用浏览器配置目录（和日常 Edge 隔离）──
$profileDir = Join-Path $logDir 'edge-profile'
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null

# ── 4. 组装 Edge 参数 ──
$edgeArgs = @(
  "--app=$url",
  "--user-data-dir=`"$profileDir`"",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-session-crashed-bubble',
  '--hide-crash-restore-bubble',
  '--disable-features=Translate,TranslateUI'
)

if ($Windowed) {
  $work = $target.WorkingArea
  $winWidth = if ($Width -gt 0) { $Width } else { $work.Width }
  $winHeight = if ($Height -gt 0) { $Height } else { $work.Height }
  $winX = if ($X -ne [int]::MinValue) { $X } else { $work.X + [int](($work.Width - $winWidth) / 2) }
  $winY = if ($Y -ne [int]::MinValue) { $Y } else { $work.Y + [int](($work.Height - $winHeight) / 2) }
  $edgeArgs += "--window-position=$winX,$winY"
  $edgeArgs += "--window-size=$winWidth,$winHeight"
  Write-Log ('启动（窗口模式 {0}x{1} @ ({2},{3})，显示器 {4}）— {5}' -f $winWidth, $winHeight, $winX, $winY, $Monitor, $url)
} else {
  # kiosk 全屏：靠窗口位置选显示器，尺寸交给全屏
  $edgeArgs += "--window-position=$($target.Bounds.Left),$($target.Bounds.Top)"
  $edgeArgs += "--window-size=$($target.Bounds.Width),$($target.Bounds.Height)"
  $edgeArgs += '--kiosk'
  Write-Log ('启动（无边框全屏 {0}x{1} @ ({2},{3})，显示器 {4}）— {5}' -f `
      $target.Bounds.Width, $target.Bounds.Height, $target.Bounds.Left, $target.Bounds.Top, $Monitor, $url)
}

$edge = Resolve-Edge -Override $EdgePath
Start-Process -FilePath $edge -ArgumentList $edgeArgs | Out-Null

# ── 5. 确认窗口真的起来了（只记日志，不阻塞使用）──
function Find-AppProcess {
  param([string]$ProfileMarker, [int]$TimeoutSeconds = 30)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $candidates = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($ProfileMarker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
    foreach ($candidate in $candidates) {
      $proc = Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue
      if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) { return $proc }
    }
    Start-Sleep -Milliseconds 300
  }
  return $null
}

$appProcess = Find-AppProcess -ProfileMarker $profileDir
if ($appProcess) {
  Write-Log ('窗口已就绪，pid={0}' -f $appProcess.Id)
  if ($Wait) { $appProcess.WaitForExit() }
} else {
  Write-Log '30 秒内没找到 Edge 应用窗口（页面可能已经开着，或 Edge 启动失败）'
}
