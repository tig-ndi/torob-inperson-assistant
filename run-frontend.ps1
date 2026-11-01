$ErrorActionPreference = 'Stop'
$webDirectory = Join-Path $PSScriptRoot 'apps\web'
Push-Location -LiteralPath $webDirectory
try {
    if (-not (Test-Path -LiteralPath 'node_modules\vite\bin\vite.js')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    }
    & npm.cmd run dev
    if ($LASTEXITCODE -ne 0) { throw 'Frontend development server stopped with an error.' }
}
finally {
    Pop-Location
}
