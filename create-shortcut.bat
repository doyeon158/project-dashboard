@echo off
rem ASCII only - cmd.exe mis-parses UTF-8 Korean inside .bat files.
rem The Korean messages are printed by tools\create-shortcut.ps1.
chcp 65001 >nul
cd /d "%~dp0"
title Create Desktop Shortcut

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\create-shortcut.ps1"

if errorlevel 1 (
  echo [ERROR] Failed to create the shortcut.
)
pause
