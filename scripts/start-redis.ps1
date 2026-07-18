# Keep Redis running for local Universe Federation development.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\start-redis.ps1

$ErrorActionPreference = "Stop"

function Test-Redis {
	try {
		$client = New-Object System.Net.Sockets.TcpClient
		$iar = $client.BeginConnect("127.0.0.1", 6379, $null, $null)
		$ok = $iar.AsyncWaitHandle.WaitOne(800)
		if ($ok -and $client.Connected) {
			$client.Close()
			return $true
		}
		$client.Close()
		return $false
	} catch {
		return $false
	}
}

if (Test-Redis) {
	Write-Host "Redis already listening on 127.0.0.1:6379"
	exit 0
}

$link = Get-Command redis-server.exe -ErrorAction SilentlyContinue
if (-not $link) {
	Write-Error "redis-server.exe not found in PATH. Install Redis (winget) first."
	exit 1
}

$item = Get-Item $link.Source
$exe = if ($item.LinkType -and $item.Target) { [string]$item.Target[0] } else { $item.FullName }
$dir = Split-Path $exe

Write-Host "Starting Redis from: $exe"
# Must run with working directory = Redis package dir (msys2 DLLs).
# Do not pass empty --save argument (breaks Start-Process on Windows PowerShell).
Start-Process -FilePath $exe -ArgumentList @("--port", "6379", "--bind", "127.0.0.1") -WorkingDirectory $dir -WindowStyle Hidden

for ($i = 0; $i -lt 20; $i++) {
	Start-Sleep -Milliseconds 300
	if (Test-Redis) {
		Write-Host "Redis is ready on 127.0.0.1:6379"
		exit 0
	}
}

Write-Error "Redis failed to start within timeout."
exit 1
