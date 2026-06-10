#Requires -Version 5.1
<#
.SYNOPSIS
  Register a logon scheduled task to start the Device Mission Control hub (hidden PowerShell + npm).

.NOTES
  Port 8787 may already be reserved by CANONICAL Operator Dashboard on DHD-Admin.
  Use -Port 8788 when the static operator dashboard should keep 8787.

.PARAMETER Remove
  Unregister the task.

.EXAMPLE
  .\Register-MissionControlHubTask.ps1
.EXAMPLE
  .\Register-MissionControlHubTask.ps1 -Port 8788 -BindHost 0.0.0.0
#>
param(
  [string]$RepoRoot = $(Split-Path (Split-Path $PSScriptRoot -Parent) -Parent),
  [string]$TaskName = 'Device Mission Control Hub',
  [int]$Port = 8787,
  [string]$BindHost = '127.0.0.1',
  [int]$LogonDelaySec = 120,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'

if ($Remove) {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue |
    Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed task: $TaskName"
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'package.json'))) {
  Write-Error "package.json not found under $RepoRoot"
}

$starter = Join-Path $PSScriptRoot 'Start-MissionControlHub.ps1'
if (-not (Test-Path -LiteralPath $starter)) {
  Write-Error "Missing $starter"
}

$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$starter`" -RepoRoot `"$RepoRoot`" -Port $Port -BindHost `"$BindHost`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
try {
  $trigger.Delay = "PT${LogonDelaySec}S"
}
catch {
  Write-Warning "Could not set logon delay: $($_.Exception.Message)"
}

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)

Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue |
  Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'Device Mission Control: observer-first hub (npm run dev:hub)'

Write-Host "Registered: $TaskName (logon + ${LogonDelaySec}s delay)"
Write-Host "Hub: http://${BindHost}:$Port/ (requires MISSION_CONTROL_TOKEN when BindHost is not loopback)"
