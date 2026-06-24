param(
  [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$backendOut = Join-Path $env:TEMP "goldprince-backend.out.log"
$backendErr = Join-Path $env:TEMP "goldprince-backend.err.log"
$frontendLog = Join-Path $env:TEMP "goldprince-frontend.log"
$frontendErr = Join-Path $env:TEMP "goldprince-frontend.err.log"

if (Test-Path (Join-Path $ProjectRoot ".next")) {
  Remove-Item -Recurse -Force (Join-Path $ProjectRoot ".next")
}

Start-Process -WindowStyle Hidden -FilePath "C:\Python314\python.exe" -ArgumentList @(
  "-m", "uvicorn", "backend_api:app", "--host", "127.0.0.1", "--port", "8000"
) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr

Start-Sleep -Seconds 2

Write-Host "Building frontend..."
& cmd.exe /c "npm.cmd run build > `"$frontendLog`" 2>&1"

Write-Host "Starting frontend..."
$nodeExe = "C:\Program Files\nodejs\node.exe"
$nextCli = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
$frontendCommand = '"' + $nodeExe + '" "' + $nextCli + '" start -p 3001 -H 127.0.0.1'
Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList @(
  "/c", "start", '""', "/b", $frontendCommand
) -WorkingDirectory $ProjectRoot

Write-Host "Starting GOLDPRINCE web app..."
Write-Host "Backend log: $backendOut / $backendErr"
Write-Host "Frontend log: $frontendLog / $frontendErr"
