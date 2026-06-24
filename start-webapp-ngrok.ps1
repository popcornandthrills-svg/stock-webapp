param(
  [string]$Port = "3001"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$backendOut = Join-Path $env:TEMP "goldprince-backend.out.log"
$backendErr = Join-Path $env:TEMP "goldprince-backend.err.log"
$frontendLog = Join-Path $env:TEMP "goldprince-frontend.log"
$frontendErr = Join-Path $env:TEMP "goldprince-frontend.err.log"

function Stop-PortProcess {
  param([string]$TargetPort)
  try {
    $lines = netstat -ano | Select-String ":$TargetPort"
    foreach ($line in $lines) {
      $text = $line.ToString().Trim()
      if ($text -notmatch "\s(\d+)$") { continue }
      $processId = [int]$Matches[1]
      if ($processId -gt 0) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    Write-Host ("Could not clear port {0}: {1}" -f $TargetPort, $_.Exception.Message)
  }
}

function Stop-NgrokProcess {
  try {
    $ngrokProcs = Get-Process ngrok -ErrorAction SilentlyContinue
    if ($ngrokProcs) {
      $ngrokProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Host ("Could not stop ngrok: {0}" -f $_.Exception.Message)
  }
}

function Start-DetachedProcess {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [string]$StdOut,
    [string]$StdErr,
    [switch]$Hidden
  )

  $params = @{
    FilePath = $FilePath
    ArgumentList = $ArgumentList
    WorkingDirectory = $WorkingDirectory
    RedirectStandardOutput = $StdOut
    RedirectStandardError = $StdErr
  }
  if ($Hidden) {
    $params.WindowStyle = "Hidden"
  }
  Start-Process @params
}

Stop-PortProcess -TargetPort $Port
Stop-NgrokProcess

Write-Host "Starting backend..."
Start-DetachedProcess -FilePath "C:\Python314\python.exe" -ArgumentList @(
  "-m", "uvicorn", "backend_api:app", "--host", "127.0.0.1", "--port", "8000"
) -WorkingDirectory $ProjectRoot -StdOut $backendOut -StdErr $backendErr -Hidden

Start-Sleep -Seconds 2

Write-Host "Building frontend..."
& cmd.exe /c "npm.cmd run build > `"$frontendLog`" 2>&1"

Write-Host "Starting frontend on port $Port..."
$nodeExe = "C:\Program Files\nodejs\node.exe"
$nextCli = Join-Path $ProjectRoot "node_modules\next\dist\bin\next"
Start-DetachedProcess -FilePath $nodeExe -ArgumentList @(
  $nextCli, "start", "-p", $Port, "-H", "127.0.0.1"
) -WorkingDirectory $ProjectRoot -StdOut $frontendLog -StdErr $frontendErr -Hidden

Start-Sleep -Seconds 4

Write-Host "Starting ngrok tunnel for http://127.0.0.1:$Port ..."
$ngrokCommand = Get-Command ngrok -ErrorAction Stop
$ngrokExe = $ngrokCommand.Source
if (-not $ngrokExe) {
  $ngrokExe = $ngrokCommand.Path
}
Start-Process -WindowStyle Normal -FilePath $ngrokExe -ArgumentList @("http", $Port)

Write-Host "Done."
Write-Host "Backend log: $backendOut / $backendErr"
Write-Host "Frontend log: $frontendLog / $frontendErr"
