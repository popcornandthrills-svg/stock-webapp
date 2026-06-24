@echo off
setlocal
set "ROOT=%~dp0"
"C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-webapp-ngrok.ps1"
echo.
echo If this window closes, check the log files in %TEMP%.
pause
