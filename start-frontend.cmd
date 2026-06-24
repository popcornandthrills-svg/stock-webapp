@echo off
setlocal
set "ROOT=%~dp0"
set "LOG=%TEMP%\goldprince-frontend.log"
set "ERR=%TEMP%\goldprince-frontend.err.log"
"C:\Program Files\nodejs\node.exe" "%ROOT%node_modules\next\dist\bin\next" start -p 3001 -H 127.0.0.1 >> "%LOG%" 2>> "%ERR%"
