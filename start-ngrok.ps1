param(
  [string]$Port = "3001"
)

$ErrorActionPreference = "Stop"

$ngrokCommand = Get-Command ngrok -ErrorAction Stop
$ngrokExe = $ngrokCommand.Source
if (-not $ngrokExe) {
  $ngrokExe = $ngrokCommand.Path
}

Write-Host "Starting ngrok tunnel to http://127.0.0.1:$Port ..."
Start-Process -WindowStyle Normal -FilePath $ngrokExe -ArgumentList @("http", $Port)
Write-Host "ngrok should now expose the frontend on port $Port."
