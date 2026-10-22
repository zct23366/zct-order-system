<#
.SYNOPSIS
  启动打印站：先自检/自愈打印机队列，再用 Chrome kiosk 打开打印站页面。

.DESCRIPTION
  打印站的静默打印依赖两件事同时成立：
    ① 浏览器默认打印机 → 队列 → 真实的 USB 端口（换过 USB 口就会断）
    ② 队列不是「脱机使用打印机」状态
  这两条任何一条断了，表现都是「提交成功但不出纸」。所以每次启动前先跑一遍
  fix-printer.ps1（幂等、约 1 秒），再拉起 Chrome。

  使用的 Chrome 配置目录与旧快捷方式一致（%LOCALAPPDATA%\chrome-kiosk-print），
  登录态与打印目标设置都保留。

.PARAMETER Url
  打印站地址，默认线上 /admin/print-station。

.PARAMETER SkipFix
  跳过打印机自检，直接开浏览器。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File print-station\start-print-station.ps1
#>
[CmdletBinding()]
param(
  [string]$Url = 'https://app-cor1b70nj9xd.vercel.app/admin/print-station',
  [switch]$SkipFix
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path $env:LOCALAPPDATA 'zct-order-print'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir 'print-station.log'

function Write-Log {
  param([string]$Message)
  $line = ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

# ── 1. 打印机自检/自愈 ──
if (-not $SkipFix) {
  $fixer = Join-Path $PSScriptRoot 'fix-printer.ps1'
  if (Test-Path -LiteralPath $fixer) {
    try {
      $report = & powershell -NoProfile -ExecutionPolicy Bypass -File $fixer 2>&1 | Out-String
      Add-Content -LiteralPath $logFile -Value $report -Encoding UTF8
      if ($LASTEXITCODE -ne 0) { Write-Log ('打印机自检返回 {0}，仍然继续启动' -f $LASTEXITCODE) }
    } catch {
      Write-Log ('打印机自检异常：{0}' -f $_.Exception.Message)
    }
  }
}

# ── 2. 拉起 Chrome kiosk ──
$chromeCandidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) { Write-Log '找不到 chrome.exe'; Write-Error '找不到 Chrome，请先安装或改用 Edge。'; exit 1 }

$profileDir = Join-Path $env:LOCALAPPDATA 'chrome-kiosk-print'
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null

Write-Log ('启动打印站 {0}' -f $Url)
Start-Process -FilePath $chrome -ArgumentList @(
  '--kiosk',
  '--kiosk-printing',
  "--user-data-dir=`"$profileDir`"",
  '--no-first-run',
  '--no-default-browser-check',
  $Url
) | Out-Null
