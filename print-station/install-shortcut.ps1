<#
.SYNOPSIS
  重建桌面/启动项里的「打印站」快捷方式，指向 start-print-station.ps1（启动前先自愈打印机）。

.DESCRIPTION
  旧快捷方式直接调 chrome.exe，打印机端口一旦错位就只会「提交成功不出纸」。
  这个脚本把快捷方式改成走 start-print-station.ps1：每次启动先跑 fix-printer.ps1，
  再拉起 Chrome kiosk。图标仍用 Chrome 的，双击观感不变。

.PARAMETER Name
  快捷方式显示名，默认「打印站」。

.PARAMETER Startup
  同时放进「启动」文件夹（开机自动开）。

.PARAMETER Remove
  删除桌面与启动项里的「打印站」快捷方式。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File print-station\install-shortcut.ps1
#>
[CmdletBinding()]
param(
  [string]$Name = '打印站',
  [switch]$Startup,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) ($Name + '.lnk')
$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) ($Name + '.lnk')

if ($Remove) {
  foreach ($link in @($desktopLink, $startupLink)) {
    if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force; Write-Host ('已删除 {0}' -f $link) }
  }
  exit 0
}

$launcher = Join-Path $PSScriptRoot 'start-print-station.ps1'
if (-not (Test-Path -LiteralPath $launcher)) { throw ('找不到 {0}' -f $launcher) }

$shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$chrome = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

$arguments = ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $launcher)

function New-Shortcut {
  param([string]$Path)
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($Path)
  $sc.TargetPath = $shell
  $sc.Arguments = $arguments
  $sc.WorkingDirectory = $PSScriptRoot
  if ($chrome) { $sc.IconLocation = ('{0},0' -f $chrome) }
  $sc.Description = '点餐系统打印站（启动前自动修复打印机队列）'
  $sc.WindowStyle = 7
  $sc.Save()
  Write-Host ('已创建 {0}' -f $Path)
}

New-Shortcut -Path $desktopLink
if ($Startup) { New-Shortcut -Path $startupLink }

Write-Host ''
Write-Host '提示：先双击「打印站」→ 在页面右上角点「测试打印」，能出纸说明整条通路已通。'
Write-Host ('日志：{0}' -f (Join-Path $env:LOCALAPPDATA 'zct-order-print\print-station.log'))
