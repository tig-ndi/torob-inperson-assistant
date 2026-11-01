param([int]$Port = 18120, [switch]$Offline, [switch]$SkipBuild, [switch]$Restart)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$python = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Python environment not found in this local project.' }
# Confine storage to this local copy.
$env:TOROB_DATABASE = Join-Path $PSScriptRoot '.local/catalogue.sqlite3'
$env:TOROB_USAGE_DATABASE = Join-Path $PSScriptRoot '.local/agent-usage.sqlite3'
$env:TOROB_WEB_DIST = Join-Path $PSScriptRoot 'apps/web/dist'
$allowed = @('BOXAPI_API_KEY','TOROB_ASSISTANT_ENABLED','TOROB_ASSISTANT_MODEL','TOROB_ASSISTANT_ATTEMPT_LIMIT','TOROB_VOICE_ENABLED','AVALAI_API_KEY')
foreach ($file in @('.env.local','.env')) {
  $settings = Join-Path $PSScriptRoot $file
  if (Test-Path -LiteralPath $settings) {
    foreach ($line in Get-Content -LiteralPath $settings -Encoding UTF8) {
      if ($line -match '^\s*([A-Z_]+)\s*=(.*)$' -and $allowed -contains $Matches[1]) {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim().Trim('"').Trim("'"), 'Process')
      }
    }
  }
}
if ($Offline) { $env:TOROB_ASSISTANT_ENABLED='0'; $env:TOROB_VOICE_ENABLED='0' }
if (!$SkipBuild -or !(Test-Path -LiteralPath 'apps/web/dist/index.html')) {
  & npm.cmd --prefix apps/web run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
if (!(Test-Path -LiteralPath $env:TOROB_DATABASE)) { throw 'Local catalogue not found in .local/catalogue.sqlite3.' }
# Initialize this copy's ledger if absent. Preserve all existing attempt rows.
'from pathlib import Path; from apps.api.agent_usage import UsageLedger; UsageLedger(Path(".local/agent-usage.sqlite3")).connect().close()' | & $python -
if ($LASTEXITCODE -ne 0) { throw 'Local usage ledger could not be opened.' }
if ($Restart) {
  $listeners = @(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $owned = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    # Only this checkout's known uvicorn process may be restarted.
    $localPythonPrefix = '"' + $python.Replace('/', '\') + '" -m uvicorn apps.api.main:app '
    if (!$owned.CommandLine.StartsWith($localPythonPrefix, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Port $Port is used by another process; it was not stopped."
    }
    Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
  }
}
Write-Host "Local app: http://127.0.0.1:$Port (Ctrl+C to stop)"
& $python -m uvicorn apps.api.main:app --host 127.0.0.1 --port $Port --no-access-log
