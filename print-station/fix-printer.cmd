@echo off
rem 双击即可自检/修复热敏打印机队列（端口绑错、队列脱机、卡住的作业）
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-printer.ps1" %*
if "%~1"=="" pause
