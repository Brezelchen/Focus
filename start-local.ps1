# Runs Focus locally: the API on http://localhost:5080 and the Angular dev server on http://localhost:4200.
# Both run in this window. Ctrl+C stops both.
#   ./start-local.ps1
# Then open http://localhost:4200 (it proxies /api to the backend).
# Data lives in backend/src/Focus.Api/App_Data/focus.db.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$api = Join-Path $PSScriptRoot 'backend/src/Focus.Api'
$web = Join-Path $PSScriptRoot 'frontend/focus-web'

if (-not (Test-Path (Join-Path $web 'node_modules'))) {
    Push-Location $web
    npm install
    $code = $LASTEXITCODE
    Pop-Location
    if ($code) { exit $code }
}

$backend = Start-Process dotnet -ArgumentList 'run', '--project', "`"$api`"", '--launch-profile', 'http' `
    -NoNewWindow -PassThru

try {
    Push-Location $web
    npm start
}
finally {
    Pop-Location
    if (-not $backend.HasExited) {
        # dotnet run starts Focus.Api.exe as a child process, so stop the whole tree.
        taskkill /T /F /PID $backend.Id | Out-Null
    }
}
