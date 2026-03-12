param(
  [switch]$SkipFrontend,
  [switch]$SkipBackend,
  [switch]$StartInfra
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host '[RepoRAG] Bootstrap started' -ForegroundColor Cyan

if (-not $SkipFrontend) {
  Write-Host '[Frontend] Installing npm packages...' -ForegroundColor Yellow
  Push-Location (Join-Path $repoRoot 'frontend')
  npm install
  Pop-Location
}

if (-not $SkipBackend) {
  Write-Host '[Backend] Setting up Python environment...' -ForegroundColor Yellow
  Push-Location (Join-Path $repoRoot 'backend')

  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  $pyLauncher = Get-Command py -ErrorAction SilentlyContinue

  if (-not $pythonCmd -and -not $pyLauncher) {
    throw 'Python not found. Install Python 3.11+ and retry.'
  }

  if (-not (Test-Path '.venv')) {
    if ($pyLauncher) {
      & $pyLauncher.Source -3.12 -m venv .venv
    }
    else {
      & $pythonCmd.Source -m venv .venv
    }
  }

  . .\.venv\Scripts\Activate.ps1
  pip install --upgrade pip
  pip install -r requirements.txt

  Pop-Location
}

if ($StartInfra) {
  Write-Host '[Infra] Starting Postgres + Redis via Docker Compose...' -ForegroundColor Yellow
  Push-Location (Join-Path $repoRoot 'infra')
  docker compose up -d
  Pop-Location
}

Write-Host '[RepoRAG] Bootstrap complete' -ForegroundColor Green
