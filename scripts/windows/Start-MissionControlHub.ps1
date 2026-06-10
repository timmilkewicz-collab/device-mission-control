#Requires -Version 5.1
<#
.SYNOPSIS
  Start Mission Control hub for Task Scheduler (skips if port already serves the discovery manifest).
#>
param(
  [string]$RepoRoot = $(Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
  [int]$Port = 8787,
  [string]$BindHost = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'
$log = Join-Path $RepoRoot '.mission-control\hub-server.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log -Parent) | Out-Null

function Write-HubLog([string]$Message) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" | Add-Content -LiteralPath $log -Encoding UTF8
}

$discoveryUrl = "http://127.0.0.1:${Port}/.well-known/mission-control.json"
try {
  $resp = Invoke-WebRequest -Uri $discoveryUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
  if ($resp.StatusCode -eq 200) {
    Write-HubLog "Skip start: discovery manifest already live at $discoveryUrl"
    exit 0
  }
}
catch {
  Write-HubLog "Port $Port not serving Mission Control yet; starting hub."
}

$env:MISSION_CONTROL_PORT = "$Port"
$env:MISSION_CONTROL_HOST = $BindHost

Push-Location $RepoRoot
try {
  Write-HubLog "Starting hub on ${BindHost}:$Port"
  & npm run dev:hub 2>&1 | ForEach-Object { Write-HubLog $_ }
}
finally {
  Pop-Location
}
