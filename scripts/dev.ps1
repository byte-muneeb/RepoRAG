$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host '[RepoRAG] Starting development services...' -ForegroundColor Cyan

$frontendPath = Join-Path $repoRoot 'frontend'
$backendPath = Join-Path $repoRoot 'backend'

Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$frontendPath'; npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$backendPath'; . .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

Write-Host '[RepoRAG] Frontend and backend terminals launched.' -ForegroundColor Green
