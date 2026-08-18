# Taiga Agent — inicia backend + frontend com um comando
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Set-Location $Root

function Ensure-Env {
    if (-not (Test-Path "$Root\.env")) {
        Copy-Item "$Root\.env.example" "$Root\.env"
        Write-Host "[ok] .env criado a partir de .env.example" -ForegroundColor Yellow
    }
}

function Ensure-Deps {
    if (-not (Test-Path "$Root\node_modules")) {
        Write-Host "[..] instalando dependencias da raiz..." -ForegroundColor DarkGray
        npm install
    }
    if (-not (Test-Path "$Root\backend\node_modules")) {
        Write-Host "[..] instalando dependencias do backend..." -ForegroundColor DarkGray
        npm install --prefix backend
    }
    if (-not (Test-Path "$Root\frontend\node_modules")) {
        Write-Host "[..] instalando dependencias do frontend..." -ForegroundColor DarkGray
        npm install --prefix frontend
    }
}

Ensure-Env
Ensure-Deps

Write-Host ""
Write-Host "  Taiga Agent" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:3000"
Write-Host "  Frontend: http://localhost:4200"
Write-Host ""
Write-Host "  Ctrl+C para encerrar os dois servidores." -ForegroundColor DarkGray
Write-Host ""

npm run dev
