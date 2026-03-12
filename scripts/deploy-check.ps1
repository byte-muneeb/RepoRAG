$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendPath = Join-Path $repoRoot 'frontend'
$backendPath = Join-Path $repoRoot 'backend'
$backendPythonExe = Join-Path $backendPath '.venv\Scripts\python.exe'
$rootPythonExe = Join-Path $repoRoot '.venv\Scripts\python.exe'
$smokePort = 8010

Write-Host '[RepoRAG] Running deployment verification...' -ForegroundColor Cyan

if (Test-Path $backendPythonExe) {
    $pythonExe = $backendPythonExe
}
elseif (Test-Path $rootPythonExe) {
    $pythonExe = $rootPythonExe
}
else {
    throw "[RepoRAG] Missing Python virtual environment. Expected either $backendPythonExe or $rootPythonExe. Run ./scripts/bootstrap.ps1 first."
}

Push-Location $frontendPath
try {
    Write-Host '[RepoRAG] Building frontend production bundle...' -ForegroundColor Yellow
    npm run build
}
finally {
    Pop-Location
}

Push-Location $backendPath
try {
    Write-Host '[RepoRAG] Running backend pytest suite...' -ForegroundColor Yellow
    & $pythonExe -m pytest -q
}
finally {
    Pop-Location
}

$serverProcess = Start-Process `
    -FilePath $pythonExe `
    -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', $smokePort) `
    -WorkingDirectory $backendPath `
    -PassThru `
    -WindowStyle Hidden

try {
    Write-Host '[RepoRAG] Running backend smoke checks...' -ForegroundColor Yellow
    $healthUrl = "http://127.0.0.1:$smokePort/v1/health"
    $depsUrl = "http://127.0.0.1:$smokePort/v1/health/deps"
    $deadline = (Get-Date).AddSeconds(30)
    $health = $null

    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500

        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
            break
        }
        catch {
            if ($serverProcess.HasExited) {
                throw '[RepoRAG] Backend process exited before smoke checks completed.'
            }
        }
    }

    if ($null -eq $health) {
        throw '[RepoRAG] Backend health endpoint did not become ready in time.'
    }

    if ($health.status -ne 'ok') {
        throw "[RepoRAG] Unexpected health response: $($health | ConvertTo-Json -Compress)"
    }

    $deps = Invoke-RestMethod -Uri $depsUrl -TimeoutSec 10
    if ($deps.status -ne 'ok') {
        throw "[RepoRAG] Unexpected dependency health response: $($deps | ConvertTo-Json -Compress)"
    }

    foreach ($dependencyName in @('groq', 'gemini', 'supabase')) {
        if (-not $deps.dependencies.PSObject.Properties.Name.Contains($dependencyName)) {
            throw "[RepoRAG] Missing dependency entry '$dependencyName' in /v1/health/deps response."
        }
    }
}
finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
    }
}

Write-Host '[RepoRAG] Deployment verification passed.' -ForegroundColor Green