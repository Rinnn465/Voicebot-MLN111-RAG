param(
    [string]$ServiceName = "VoicebotRAG",
    [string]$TaskName = "VoicebotRAG"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    python -m venv .venv
}

$Python = ".\.venv\Scripts\python.exe"

& $Python -m pip install --upgrade pip
& $Python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
& $Python -m pip install -r requirements.txt

if (-not (Test-Path ".\.env")) {
    Copy-Item ".\.env.example" ".\.env"
    Write-Warning "Created .env from .env.example. Fill real API keys before starting the service."
}

$ChromaDir = "chroma_db_qwen_06b"
$EnvLine = Get-Content ".\.env" | Where-Object { $_ -match "^CHROMA_DIR=" } | Select-Object -First 1
if ($EnvLine) {
    $ChromaDir = ($EnvLine -replace "^CHROMA_DIR=", "").Trim()
}

if (-not (Test-Path ".\$ChromaDir")) {
    & $Python Ingest.py --md data/MLN111_Chapter2.md --db $ChromaDir
}

$Service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Service) {
    Restart-Service -Name $ServiceName -Force
    Write-Host "Restarted Windows service: $ServiceName"
    exit 0
}

$Task = schtasks /Query /TN $TaskName 2>$null
if ($LASTEXITCODE -eq 0) {
    schtasks /End /TN $TaskName 2>$null | Out-Null
    schtasks /Run /TN $TaskName | Out-Null
    Write-Host "Restarted scheduled task: $TaskName"
    exit 0
}

Write-Warning "No Windows service '$ServiceName' or scheduled task '$TaskName' found. Start backend manually with scripts/run_backend.ps1 or register it as a service/task."
