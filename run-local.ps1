param([int]$Port = 18120, [switch]$Offline)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$sourceRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'torob'
$python = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Python environment not found in this checkout.' }
if (!$env:TOROB_DATABASE) { $env:TOROB_DATABASE = Join-Path $sourceRoot '.local/catalogue.sqlite3' }
if (!$env:TOROB_USAGE_DATABASE) { $env:TOROB_USAGE_DATABASE = Join-Path $sourceRoot '.local/agent-usage.sqlite3' }
# Read existing approved assistant settings; never print credentials or reset its ledger.
$settings = Join-Path $sourceRoot '.env.local'
$allowed = @('BOXAPI_API_KEY','TOROB_ASSISTANT_ENABLED','TOROB_ASSISTANT_MODEL','TOROB_ASSISTANT_ATTEMPT_LIMIT')
if (Test-Path -LiteralPath $settings) {
  foreach ($line in Get-Content -LiteralPath $settings) {
    if ($line -match '^\s*([A-Z_]+)\s*=(.*)$' -and $allowed -contains $Matches[1]) {
      $name = $Matches[1]
      if (![Environment]::GetEnvironmentVariable($name, 'Process')) {
        [Environment]::SetEnvironmentVariable($name, $Matches[2].Trim().Trim('"').Trim("'"), 'Process')
      }
    }
  }
}
if ($Offline) { $env:TOROB_ASSISTANT_ENABLED='0'; $env:TOROB_VOICE_ENABLED='0' }
if (!(Test-Path -LiteralPath 'apps/web/dist/index.html')) {
  & npm --prefix apps/web run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
if (!(Test-Path -LiteralPath $env:TOROB_DATABASE)) { throw 'Catalogue not found; set TOROB_DATABASE to the existing snapshot.' }
Write-Host "Local app: http://127.0.0.1:$Port (Ctrl+C to stop)"
& $python -m uvicorn apps.api.main:app --host 127.0.0.1 --port $Port --no-access-log
