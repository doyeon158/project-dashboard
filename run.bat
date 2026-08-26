@echo off
rem ASCII only - cmd.exe mis-parses UTF-8 Korean inside .bat files.
rem Korean messages come from launch.mjs / server.mjs after chcp 65001.
chcp 65001 >nul
cd /d "%~dp0"
title Project Dashboard

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install it from https://nodejs.org and run again.
  pause
  exit /b 1
)

node launch.mjs

rem Keep the window open only when something failed, so a normal exit
rem does not leave a stale console sitting in the taskbar.
if errorlevel 1 pause
