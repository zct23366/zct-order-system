<#
.SYNOPSIS
  在桌面生成「出餐展示屏」快捷方式（无边框窗口）。

.DESCRIPTION
  快捷方式指向 desktop\order-screen.ps1，用系统自带的 powershell.exe 启动，
  窗口隐藏启动（用户只看得到出餐屏本身），图标用 desktop\assets\order-screen.ico。

  图标来自 public\favicon.jpg，重新生成：npm run generate:pwa

.PARAMETER Name
  桌面上显示的名字，默认「出餐展示屏」。

.PARAMETER Page
  display = 出餐展示（默认）；orders = 订单管理 / 出餐台。

.PARAMETER ExtraArgs
  额外传给启动器的参数，例如 "-Monitor 2 -AlwaysOnTop"。

.PARAMETER Startup
  一并放进「启动」文件夹，开机自动打开。

.PARAMETER Uninstall
  删除桌面（和启动文件夹）里的这个快捷方式。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File desktop\install-desktop.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File desktop\install-desktop.ps1 -Monitor 2
#>
[CmdletBinding()]
param(
  [string]$Name = '出餐展示屏',
  [ValidateSet('display', 'orders')]
  [string]$Page = 'display',
  [string]$ExtraArgs = '',
  [switch]$Startup,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$desktopDir = [Environment]::GetFolderPath('Desktop')
$startupDir = [Environment]::GetFolderPath('Startup')
$desktopLink = Join-Path $desktopDir ($Name + '.lnk')
$startupLink = Join-Path $startupDir ($Name + '.lnk')

if ($Uninstall) {
  foreach ($link in @($desktopLink, $startupLink)) {
    if (Test-Path -LiteralPath $link) {
      Remove-Item -LiteralPath $link -Force
      Write-Host ('已删除 {0}' -f $link)
    }
  }
  return
}

$launcher = Join-Path $PSScriptRoot 'order-screen.ps1'
if (-not (Test-Path -LiteralPath $launcher)) {
  throw ('找不到启动器：{0}' -f $launcher)
}

$icon = Join-Path $PSScriptRoot 'assets\order-screen.ico'
if (-not (Test-Path -LiteralPath $icon)) {
  throw ('找不到图标：{0}。先在仓库根目录跑 npm run generate:pwa 生成。' -f $icon)
}

# 系统自带的 Windows PowerShell 5.1 最稳；执行策略默认是 Restricted，所以走 Bypass
$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $shell)) { $shell = 'powershell.exe' }

$arguments = ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -Page {1}' -f $launcher, $Page)
if ($ExtraArgs.Trim()) { $arguments = $arguments + ' ' + $ExtraArgs.Trim() }

function New-ScreenShortcut {
  param([string]$Path)
  $shellObject = New-Object -ComObject WScript.Shell
  $shortcut = $shellObject.CreateShortcut($Path)
  $shortcut.TargetPath = $shell
  $shortcut.Arguments = $arguments
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.IconLocation = ('{0},0' -f $icon)
  $shortcut.Description = '点餐系统出餐展示 · 无边框窗口'
  $shortcut.WindowStyle = 7            # 7 = 最小化启动，避免闪一个控制台窗口
  $shortcut.Save()
  Write-Host ('已创建 {0}' -f $Path)
}

New-ScreenShortcut -Path $desktopLink
if ($Startup) { New-ScreenShortcut -Path $startupLink }

Write-Host ''
Write-Host '提示：窗口没有标题栏，Alt+F4 关闭；要挪位置或换屏就改参数重跑一次。'
Write-Host ('日志：{0}' -f (Join-Path $env:LOCALAPPDATA 'zct-order-screen\launcher.log'))
