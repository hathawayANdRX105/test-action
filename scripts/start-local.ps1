# Universe Federation local launcher (Windows PowerShell)
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
# Or double-click: scripts\start-local.bat

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "package.json"))) {
	Write-Host "ERROR: package.json not found under $Root" -ForegroundColor Red
	exit 1
}

# Ensure Node / pnpm (nvm4w) are on PATH for double-click launches
$nodeDirs = @(
	"C:\nvm4w\nodejs",
	"$env:APPDATA\npm",
	"$env:LOCALAPPDATA\pnpm",
	"$env:ProgramFiles\nodejs"
)
foreach ($d in $nodeDirs) {
	if ($d -and (Test-Path $d)) {
		$env:Path = "$d;" + $env:Path
	}
}

function Test-Port([int]$Port) {
	try {
		$client = New-Object System.Net.Sockets.TcpClient
		$iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
		$ok = $iar.AsyncWaitHandle.WaitOne(600)
		$connected = $ok -and $client.Connected
		$client.Close()
		return $connected
	} catch {
		return $false
	}
}

Set-Location $Root
$Host.UI.RawUI.WindowTitle = "Universe Federation"

Write-Host ""
Write-Host "============================================================"
Write-Host "  Universe Federation local start"
Write-Host "  Root: $Root"
Write-Host "============================================================"
Write-Host ""

# 1) Node / pnpm
$node = Get-Command node -ErrorAction SilentlyContinue
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $node) {
	Write-Host "ERROR: node not found in PATH." -ForegroundColor Red
	Write-Host "Install Node 22 (nvm4w) and reopen, or run from a terminal where 'node -v' works."
	Read-Host "Press Enter to close"
	exit 1
}
if (-not $pnpm) {
	Write-Host "ERROR: pnpm not found in PATH." -ForegroundColor Red
	Write-Host "Try: npm install -g pnpm@10"
	Write-Host "Or open a terminal that already has pnpm (nvm4w nodejs dir)."
	Read-Host "Press Enter to close"
	exit 1
}
Write-Host "[ok] node  = $(node -v)"
Write-Host "[ok] pnpm  = $(pnpm -v)"

# 2) Redis
Write-Host ""
Write-Host "[1/3] Redis (127.0.0.1:6379)..."
if (Test-Port 6379) {
	Write-Host "      already listening"
} else {
	$redisScript = Join-Path $PSScriptRoot "start-redis.ps1"
	if (Test-Path $redisScript) {
		& powershell -NoProfile -ExecutionPolicy Bypass -File $redisScript
		if ($LASTEXITCODE -ne 0) {
			Write-Host "ERROR: failed to start Redis. Install redis-server or start it manually." -ForegroundColor Red
			Read-Host "Press Enter to close"
			exit 1
		}
	} else {
		Write-Host "ERROR: scripts\start-redis.ps1 missing and Redis is down." -ForegroundColor Red
		Read-Host "Press Enter to close"
		exit 1
	}
}

# 3) Already running?
Write-Host ""
Write-Host "[2/3] App port 3005..."
if (Test-Port 3005) {
	Write-Host "      already listening — open http://127.0.0.1:3005"
	Start-Process "http://127.0.0.1:3005"
	Write-Host ""
	Write-Host "Server is already running. This window can be closed."
	Read-Host "Press Enter to close"
	exit 0
}

# 4) Optional emoji assets (skip if present)
$emojiProbe = Join-Path $Root "assets\emojis\fluent-emojis\dist\1f3c6.png"
if (-not (Test-Path $emojiProbe)) {
	Write-Host "[info] fluent-emojis missing — running scripts\setup-emojis.mjs"
	node (Join-Path $PSScriptRoot "setup-emojis.mjs")
}

# 5) Start
Write-Host ""
Write-Host "[3/3] Starting pnpm start (this window IS the server)"
Write-Host "      URL: http://127.0.0.1:3005"
Write-Host "      Stop: Ctrl+C"
Write-Host ""

$env:NODE_OPTIONS = "--max-old-space-size=8192"
Start-Process "http://127.0.0.1:3005" -ErrorAction SilentlyContinue

pnpm start
$ec = $LASTEXITCODE
Write-Host ""
Write-Host "Server exited with code $ec"
Read-Host "Press Enter to close"
exit $ec
