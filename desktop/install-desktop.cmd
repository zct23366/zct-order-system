@echo off
rem 双击即可在桌面生成「出餐展示屏」快捷方式（参数会原样传给 install-desktop.ps1）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-desktop.ps1" %*
if "%~1"=="" pause
