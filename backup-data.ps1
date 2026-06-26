param(
  [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupRoot = Join-Path $ProjectRoot "backups"
$snapshotDir = Join-Path $backupRoot $timestamp

New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null

$sourceFiles = @(
  "stock.db",
  "stock.db.pre-restore.bak",
  "data\accounts.json"
)

foreach ($relativePath in $sourceFiles) {
  $source = Join-Path $ProjectRoot $relativePath
  if (Test-Path $source) {
    $target = Join-Path $snapshotDir (Split-Path $relativePath -Leaf)
    Copy-Item -LiteralPath $source -Destination $target -Force
  }
}

$manifest = [ordered]@{
  created_at = (Get-Date).ToString("o")
  files = $sourceFiles | Where-Object { Test-Path (Join-Path $ProjectRoot $_) }
}

$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $snapshotDir "manifest.json") -Encoding UTF8

Write-Host "Backup created at $snapshotDir"
