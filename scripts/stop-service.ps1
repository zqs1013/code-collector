$ErrorActionPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ports = 3000, 3001, 3002, 3003, 3004, 3005, 5000

Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -and
  ($_.CommandLine -match "server\.js") -and
  ($_.CommandLine -like "*$root*" -or $_.CommandLine -match "code-collector")
} | ForEach-Object {
  Write-Host "  kill node PID=$($_.ProcessId)"
  Stop-Process -Id $_.ProcessId -Force
}

foreach ($port in $ports) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $procId = $_.OwningProcess
    if ($procId -and $procId -ne 0) {
      Write-Host "  kill port $port PID=$procId"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

Start-Sleep -Seconds 1
Write-Host "  stop complete"
