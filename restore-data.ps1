param(
  [Parameter(Mandatory = $true)]
  [string]$SnapshotDir,
  [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$resolvedProjectRoot = (Resolve-Path $ProjectRoot).Path
$resolvedSnapshotDir = (Resolve-Path $SnapshotDir).Path

if (-not (Test-Path $resolvedSnapshotDir)) {
  throw "Snapshot directory not found: $SnapshotDir"
}

$restoreMap = @{
  "stock.db" = "stock.db"
  "stock.db.pre-restore.bak" = "stock.db.pre-restore.bak"
  "accounts.json" = "data\accounts.json"
}

foreach ($entry in $restoreMap.GetEnumerator()) {
  $source = Join-Path $resolvedSnapshotDir $entry.Key
  if (Test-Path $source) {
    $destination = Join-Path $resolvedProjectRoot $entry.Value
    $destinationDir = Split-Path $destination -Parent
    New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

Write-Host "Restore completed from $resolvedSnapshotDir"
